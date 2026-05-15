import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'fs';
import { join, relative } from 'path';

const TOKEN = process.env.GITHUB_TOKEN;
const ROOT = process.cwd();
const ENDPOINT = 'https://models.github.ai/inference/chat/completions';
const MODEL = 'openai/gpt-4.1';

const IGNORE_DIRS = new Set([
  'node_modules', 'dist', 'build', '.git', '.github',
  'coverage', '.next', '.cache', 'vendor', '__pycache__',
  '.venv', 'venv', 'target', '.idea', '.vscode', 'out',
]);

const IGNORE_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'Cargo.lock', 'poetry.lock', 'composer.lock', '.DS_Store',
]);

const ANCHOR_FILES = new Set([
  'package.json', 'pyproject.toml', 'Cargo.toml', 'go.mod',
  'composer.json', 'Gemfile', 'requirements.txt', 'setup.py',
  'tsconfig.json', 'Dockerfile', 'docker-compose.yml',
  'Makefile', 'taskfile.yml', 'Taskfile.yml',
  '.env.example', 'pom.xml',
]);

const CODE_EXTS = new Set([
  '.js', '.ts', '.jsx', '.tsx', '.mjs', '.cjs',
  '.py', '.go', '.rs', '.rb', '.java', '.php', '.cs', '.kt', '.swift',
  '.sql', '.sh',
]);

const CONFIG_EXTS = new Set(['.yaml', '.yml', '.toml', '.ini', '.json', '.env']);

const MAX_FILE_BYTES = 30_000;
const MAX_TOTAL_BYTES = 300_000;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...walk(full));
    } else if (!IGNORE_FILES.has(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

function buildTree(files) {
  return files.map(f => relative(ROOT, f)).sort().join('\n');
}

function collectContent(files) {
  let total = 0;
  const chunks = [];

  // 1. Archivos ancla (manifests, Dockerfile, Makefile, etc.)
  const anchors = files.filter(f => ANCHOR_FILES.has(f.split('/').pop()));
  for (const file of anchors) {
    const content = readFileSync(file, 'utf8');
    chunks.push(`### ${relative(ROOT, file)}\n\`\`\`\n${content}\n\`\`\``);
    total += content.length;
  }

  // 2. Archivos de configuración (.yaml, .toml, .ini, .env, .json)
  const configs = files.filter(f => {
    const name = f.split('/').pop();
    const ext = '.' + name.split('.').pop();
    return CONFIG_EXTS.has(ext) && !ANCHOR_FILES.has(name);
  });
  for (const file of configs) {
    if (total > MAX_TOTAL_BYTES) break;
    try {
      const stat = statSync(file);
      if (stat.size > MAX_FILE_BYTES) continue;
      const content = readFileSync(file, 'utf8');
      chunks.push(`### ${relative(ROOT, file)}\n\`\`\`\n${content}\n\`\`\``);
      total += content.length;
    } catch { /* skip */ }
  }

  // 3. Código fuente
  const code = files.filter(f => {
    const name = f.split('/').pop();
    const ext = '.' + name.split('.').pop();
    return CODE_EXTS.has(ext) && !ANCHOR_FILES.has(name);
  });
  for (const file of code) {
    if (total > MAX_TOTAL_BYTES) break;
    try {
      const stat = statSync(file);
      if (stat.size > MAX_FILE_BYTES) continue;
      const content = readFileSync(file, 'utf8');
      chunks.push(`### ${relative(ROOT, file)}\n\`\`\`\n${content}\n\`\`\``);
      total += content.length;
    } catch { /* skip */ }
  }

  return chunks.join('\n\n');
}

function extractKeepBlocks(readme) {
  if (!readme) return [];
  const blocks = [];
  const regex = /<!-- keep:(\w+) -->([\s\S]*?)<!-- \/keep:\1 -->/g;
  let m;
  while ((m = regex.exec(readme))) blocks.push(m[0]);
  return blocks;
}

const SYSTEM_PROMPT = `Eres un redactor técnico. Tu tarea es generar un README.md para el proyecto o módulo cuyo código se te proporciona como entrada.

PRINCIPIOS GENERALES
- Idioma: español técnico, conciso y directo. Sin relleno comercial ni emojis (salvo los que aparezcan literalmente en logs/código).
- Formato: Markdown GitHub-flavored.
- Toda afirmación debe poder justificarse desde el código. No inventes nombres de ficheros, funciones, variables, tablas, endpoints, dependencias ni valores por defecto. Si un dato no aparece, omítelo o escribe \`—\`.
- Enlaza con rutas relativas a los ficheros reales: \`[fichero.ext](ruta/relativa.ext)\`, \`[carpeta/](ruta/carpeta/)\`.
- No documentes secciones para las que no hay información real; omítelas en vez de rellenarlas.
- No incluyas instrucciones de licencia, contribución ni código de conducta salvo que existan ficheros que las respalden.

PASOS DE ANÁLISIS PREVIOS A REDACTAR
1. Detecta el lenguaje/stack principal por extensiones y manifests (\`package.json\`, \`pyproject.toml\`, \`requirements.txt\`, \`go.mod\`, \`Cargo.toml\`, \`pom.xml\`, etc.).
2. Identifica el punto de entrada (script CLI, servidor, job, librería) buscando \`main\`, \`if __name__ == "__main__"\`, \`bin\`/\`scripts\` en manifests, \`Dockerfile\` \`CMD\`/\`ENTRYPOINT\`, targets de \`Makefile\`, workflows, etc.
3. Detecta fuentes y destinos de datos / servicios externos: clientes HTTP, SDKs, drivers de BBDD, colas, ficheros, etc.
4. Extrae configuración: ficheros \`*.ini\`/\`*.yaml\`/\`*.toml\`/\`*.env(.example)\` leídos por el código, y todas las llamadas a \`os.environ\`/\`process.env\`/\`getenv\`/equivalentes.
5. Extrae interfaz de ejecución: argumentos CLI (\`argparse\`, \`click\`, \`cobra\`, \`commander\`…), targets de \`Makefile\`/\`npm scripts\`/\`taskfile\`, comandos de Docker/Compose.
6. Detecta efectos secundarios sobre sistemas compartidos: inserts, deletes, escrituras de fichero, llamadas a APIs externas, mensajes a colas.
7. Detecta tests, linters y CI (\`.github/workflows\`, \`pre-commit\`, etc.) solo si son relevantes para ejecutar el módulo.

ESTRUCTURA DEL README (orden sugerido; incluye solo las secciones aplicables)

1. \`# <Nombre> — <una línea: qué hace y para qué>\`
   Párrafo de 2–4 líneas: qué resuelve, entradas, salidas, y cualquier discriminador clave (entorno, tipo, modo).

2. \`## Contexto\`  (solo si aplica)
   Relación con otros módulos/repos, motivación de negocio, restricciones compartidas.

3. \`## Arquitectura\`
   - Diagrama ASCII dentro de un bloque \`\`\` \`\`\` mostrando fuentes → procesamiento → destinos, usando los nombres reales de ficheros/funciones/servicios.
   - Lista \`Componentes clave:\` con bullets, cada uno enlazando al fichero/carpeta y describiéndolo en una frase.

4. \`## Estructura\`  (solo si la organización de ficheros no es trivial)
   Árbol de ficheros relevantes en un bloque \`\`\` \`\`\` con un comentario corto por entrada. Omite ruido.

5. \`## Requisitos previos\`
   Bullets con runtime y versiones, gestor de dependencias, herramientas externas, accesos de red, recursos preexistentes.

6. \`## Instalación\`  (solo si no se ejecuta vía contenedor)
   Comandos exactos para instalar dependencias según el manifest detectado.

7. \`## Configuración\`
   - Para cada fichero de configuración leído por el código: bloque con su formato mostrando solo las claves que el código realmente consume.
   - Tabla de variables de entorno detectadas: \`Variable | Descripción | Default\`. Marca como \`—\` los defaults inexistentes.
   - Si hay secretos, indica de dónde se esperan sin mostrar valores.

8. \`## Uso\` / \`## Ejecución\`
   - Comando o comandos exactos. Si hay \`Makefile\`/\`npm scripts\`/\`taskfile\`, prioriza esos targets.
   - Argumentos CLI con tabla \`Argumento | Descripción | Default\`.
   - Ejemplos mínimos reproducibles.
   - Si aplica: comando para tests.

9. \`## Lógica / Reglas de negocio\`  (solo si el módulo aplica reglas no triviales)
   Subsecciones por etapa o componente. Documenta entradas, transformaciones, fórmulas exactas tal como aparecen en el código, condiciones de borde, valores fijos y filtros.

10. \`## Datos / Persistencia\`  (solo si hay efectos sobre almacenamiento)
    - Esquema o forma de los datos producidos/consumidos.
    - Estrategia de carga (append, upsert, full-refresh…) con la sentencia o llamada real en bloque de código.
    - Advertencias sobre filtros críticos.

11. \`## API\`  (solo si expone HTTP/gRPC/CLI pública)
    Tabla o lista de endpoints/comandos con método, ruta, parámetros y respuesta.

12. \`## Observabilidad\`
    Qué se loguea (formato literal si aparece en el código), niveles, métricas/trazas emitidas, códigos de salida.

13. \`## Troubleshooting\`  (solo si hay errores conocidos manejados en el código)
    Tabla \`Síntoma | Causa probable | Acción\`, basada en excepciones capturadas y mensajes de error reales.

VERIFICACIONES ANTES DE EMITIR
- Todo fichero, función, variable, comando, endpoint o valor citado existe en la entrada.
- Los enlaces relativos resuelven contra la estructura real.
- No hay secciones vacías ni con texto genérico tipo "TODO" o "aquí se explicará…".
- El README es autocontenido: un lector que solo lo tenga a él debe poder instalar, configurar y ejecutar el módulo.

SALIDA
Devuelve únicamente el contenido del README.md, sin envolverlo en bloques de código ni añadir comentarios fuera de él.`;

async function main() {
  const files = walk(ROOT);
  const tree = buildTree(files);
  const content = collectContent(files);
  const existing = existsSync('README.md') ? readFileSync('README.md', 'utf8') : '';
  const keepBlocks = extractKeepBlocks(existing);

  const userPrompt = `RUTA RAÍZ DEL PROYECTO: ${ROOT}

LISTADO DE FICHEROS DEL PROYECTO:
\`\`\`
${tree}
\`\`\`

CONTENIDO DE LOS FICHEROS RELEVANTES:
${content}

${existing ? `\nREADME ACTUAL (úsalo como referencia de estilo si es coherente con las reglas; si no, ignóralo):\n${existing}\n` : ''}

${keepBlocks.length ? `\nBLOQUES A PRESERVAR EXACTAMENTE (insértalos donde encajen):\n${keepBlocks.join('\n\n')}\n` : ''}

Genera ahora el README.md siguiendo todas las reglas del sistema.`;

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Accept': 'application/vnd.github+json',
      'Authorization': `Bearer ${TOKEN}`,
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: 8000,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`GitHub Models API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const newReadme = data.choices[0].message.content.trim();

  writeFileSync('README.md', newReadme);
  console.log(`README.md generado (${newReadme.length} caracteres)`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
