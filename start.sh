
# 1. Iniciar servidor y abrirlo en el navegador:
python3 server.py & sleep 1 && open http://localhost:3000

# 2. Comando manual para cerrar servidor:
lsof -ti :3000 | xargs kill -9
