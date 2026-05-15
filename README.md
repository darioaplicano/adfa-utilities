# ssh-utilities — Utilidades Bash para operaciones remotas en clústeres

Este repositorio contiene scripts Bash para automatizar la copia de directorios y la ejecución de comandos en múltiples servidores de un clúster mediante SSH. Los destinos de los servidores se definen en ficheros de texto y la autenticación se realiza con `sshpass` usando una contraseña almacenada localmente. Los scripts están diseñados para entornos donde se requiere la distribución de claves o la ejecución de tareas administrativas de forma masiva.

## Arquitectura

```
clusterremotes.txt
      │
      ▼
remoteexeccommands.sh (copy_filedir_cluster/)
      │
      ├─→ sshpass + scp → host:/projects/git-crypt-keys/
      │
      ▼
remoteexeccommands.sh (execute_command_cluster/)
      │
      ├─→ sshpass + ssh → host:'bash -s' < commands.sh
      │
      ▼
commands.sh (ejecutado remotamente)
```

Componentes clave:

- [copy_filedir_cluster/remoteexeccommands.sh](copy_filedir_cluster/remoteexeccommands.sh): Copia recursivamente claves desde un directorio local a la misma ruta en cada host listado.
- [execute_command_cluster/remoteexeccommands.sh](execute_command_cluster/remoteexeccommands.sh): Ejecuta comandos definidos en `commands.sh` en cada host remoto.
- [execute_command_cluster/commands.sh](execute_command_cluster/commands.sh): Script de comandos a ejecutar remotamente (por defecto elimina `/home/sysadmin/teeexto.txt`).
- [copy_filedir_cluster/clusterremotes.txt](copy_filedir_cluster/clusterremotes.txt), [execute_command_cluster/clusterremotes.txt](execute_command_cluster/clusterremotes.txt): Listados de hosts destino, uno por línea.
- [copy_filedir_cluster/mypass](copy_filedir_cluster/mypass), [execute_command_cluster/mypass](execute_command_cluster/mypass): Ficheros de contraseña para `sshpass`.

## Estructura

```
copy_filedir_cluster/
├── clusterremotes.txt      # Hosts destino para copia de claves
├── mypass                  # Contraseña para sshpass
└── remoteexeccommands.sh   # Script de copia remota

execute_command_cluster/
├── clusterremotes.txt      # Hosts destino para ejecución de comandos
├── commands.sh             # Comandos a ejecutar remotamente
├── mypass                  # Contraseña para sshpass
└── remoteexeccommands.sh   # Script de ejecución remota
```

## Requisitos previos

- Bash (entorno Unix)
- `sshpass` instalado y accesible en `$PATH`
- Acceso de red SSH a los hosts definidos en los ficheros `clusterremotes.txt`
- Los hosts deben aceptar autenticación por contraseña
- Permisos de escritura en los destinos remotos especificados

## Configuración

### Ficheros requeridos

- `clusterremotes.txt`: Lista de hosts, uno por línea, en cada subcarpeta.
- `mypass`: Fichero de texto plano con la contraseña SSH, en cada subcarpeta.

### Variables y rutas fijas

- El directorio de claves a copiar es `/home/sysadmin/projects/git-crypt-keys/`.
- El destino remoto para la copia es `$host/projects/git-crypt-keys/`.
- El fichero de comandos ejecutado remotamente es `commands.sh` en la carpeta correspondiente.

## Ejecución

### Copiar claves a todos los hosts

```bash
cd copy_filedir_cluster
bash remoteexeccommands.sh
```

### Ejecutar comandos en todos los hosts

```bash
cd execute_command_cluster
bash remoteexeccommands.sh
```

Los scripts mostrarán por pantalla el nombre de cada host procesado.

## Lógica

### Copia de claves (`copy_filedir_cluster/remoteexeccommands.sh`)

- Lee la lista de hosts de `clusterremotes.txt`.
- Para cada host, ejecuta:
  ```bash
  sshpass -fmypass scp -r /home/sysadmin/projects/git-crypt-keys/* $host/projects/git-crypt-keys/
  ```
- Sobrescribe los ficheros en el destino si existen.

### Ejecución remota de comandos (`execute_command_cluster/remoteexeccommands.sh`)

- Lee la lista de hosts de `clusterremotes.txt`.
- Para cada host, ejecuta:
  ```bash
  sshpass -fmypass ssh $host 'bash -s' < commands.sh
  ```
- El script remoto por defecto elimina `/home/sysadmin/teeexto.txt`.

## Observabilidad

- Cada script imprime el nombre del host antes de operar sobre él.
- No hay logs adicionales ni manejo explícito de errores; cualquier error de SSH/SCP se mostrará en la salida estándar.

## Troubleshooting

| Síntoma                                 | Causa probable                                 | Acción                                      |
|------------------------------------------|------------------------------------------------|---------------------------------------------|
| Permiso denegado o autenticación fallida | Contraseña incorrecta en `mypass`              | Verificar el contenido del fichero `mypass` |
| No se copia ningún fichero               | Ruta local o remota incorrecta/no existe       | Verificar rutas en el script                |
| Comando remoto no tiene efecto           | `commands.sh` vacío o sin permisos de lectura  | Revisar y ajustar el script                 |
| Error: sshpass no encontrado             | `sshpass` no instalado                        | Instalar `sshpass` en el sistema            |