FROM python:3.12-slim
WORKDIR /app
COPY server.py .
COPY static ./static
COPY launcher/ui ./launcher/ui
EXPOSE 8787
CMD ["python", "server.py"]
