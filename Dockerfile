FROM python:3.14-alpine
WORKDIR /app
RUN adduser -D -u 10001 trailcam && mkdir /data && chown trailcam /data
COPY server.py settings-schema.json ./
COPY dist ./dist
USER trailcam
ENV DATABASE_PATH=/data/presets.sqlite3 PORT=8080
EXPOSE 8080
CMD ["python", "server.py"]
