FROM maven:3.9.9-eclipse-temurin-17 AS fingerprint
WORKDIR /build
COPY fingerprint/pom.xml ./
COPY fingerprint/src ./src
RUN mvn -q package -DskipTests

FROM python:3.12-slim-bookworm
RUN apt-get update && apt-get install -y --no-install-recommends openjdk-17-jre-headless libglib2.0-0 && rm -rf /var/lib/apt/lists/*
WORKDIR /lab
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY models/manifest.json ./models/manifest.json
COPY scripts/download_models.py ./scripts/download_models.py
RUN python scripts/download_models.py
COPY --from=fingerprint /build/target/fingerprint-lab-0.1.0.jar ./fingerprint/target/fingerprint-lab-0.1.0.jar
COPY app.py engines.py store.py ./
COPY web ./web
RUN useradd --uid 10001 --create-home lab && mkdir /data && chown lab:lab /data
USER lab
ENV BIO_LAB_DATA=/data
EXPOSE 8791
CMD ["uvicorn", "app:create_app", "--factory", "--host", "0.0.0.0", "--port", "8791", "--workers", "1", "--no-access-log"]
