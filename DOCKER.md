# 🐳 Docker Setup Guide — PDF Tools Suite

This guide explains how to build and run the **PDF Tools Suite** using Docker for local development or self-hosting.

---

# 📦 What Is Docker?

[Docker](https://www.docker.com/) is a containerization platform that allows you to package your application and all its dependencies into a portable container.

This ensures:
- ✅ Consistent environment
- ✅ No dependency conflicts
- ✅ Easy deployment
- ✅ Works the same on all machines

A container is like:

> 📦 A small isolated box that contains your app + everything it needs to run.

So instead of installing Node.js manually, Docker handles everything.

---

# 📋 Prerequisites

Before starting, make sure:

- Docker Desktop is installed [[Download](https://docs.docker.com/get-docker/)]
- Docker is running

### Verify Installation

Open a terminal and run:

```bash
docker --version
```

If Docker is installed correctly, you should see a version number like: `Docker version 25.x.x`

---

# 🏗️ Step 1 — Build the Docker Image

Inside your project root directory, run:

```bash
docker build -t pdf-tools .
```

### What This Does

- Reads the `Dockerfile`
- Prepares the Node environment and installs dependencies
- Builds the Next.js application as a static export
- Creates an optimized Docker image named `pdf-tools`

The `.` means:

> “Use this current folder as input.”

If successful, you will see text ending with something like:

```
Successfully tagged pdf-tools:latest
```

---

# ▶️ Step 2 — Run the Container

Start the application using:

```bash
docker run -p 3000:3000 pdf-tools
```

### What This Does

- Runs a container from the `pdf-tools` image
- Maps port 3000 (your machine)
- To port 3000 (inside the container)

so:
```
Your Browser → localhost:3000 → Docker → Next.js Node Server
```

---

# 🌐 Step 3 — Open in Browser

Open your browser and visit:

```
http://localhost:3000
```

Your PDF Tools Suite should now be running!

---

# 🛑 Stop the Container

If running in the foreground, press:

```
CTRL + C
```

Or if running in background:

```bash
docker stop pdf-tools
```

---

# 🔄 Useful Docker Commands

## Run in Background (Detached mode)

```bash
docker run -d -p 3000:3000 --name pdf-tools pdf-tools
```

## View Running Containers

```bash
docker ps
```

## View All Containers (Running and Stopped)

```bash
docker ps -a
```

## View Logs

```bash
docker logs pdf-tools
```

## Remove Container (to start fresh)

```bash
docker rm -f pdf-tools
```

---

# 🐙 Optional — Using Docker Compose

Instead of running multiple commands manually, you can use Docker Compose.

Create a file named `docker-compose.yml` in the project root:

```yaml
version: "3.9"

services:
  pdf-tools:
    build: .
    ports:
      - "3000:3000"
    restart: unless-stopped
    environment:
      - NODE_ENV=production
```

## Start with Compose

```bash
docker compose up --build
```

Run in background:

```bash
docker compose up -d --build
```

Stop and remove container:

```bash
docker compose down
```

---

# 🧩 How It Works

Architecture flow:

```
Browser
   ↓
localhost:3000
   ↓
Docker Container
   ↓
Node.js static file server
   ↓
Serves the web application UI
   ↓
PDF Processing runs 100% in Browser via WebAssembly
```

Even though a Node.js server serves the initial HTML and JS files, **all PDF manipulation (merging, splitting, protecting, etc.) happens entirely on the client side inside the browser.** The Docker container is strictly for serving the interface securely. No user files are ever uploaded or processed on the server/Docker container.

---

# ⚡ Quick Reference

| Command                             | Description                 |
| ----------------------------------- | --------------------------- |
| `docker build -t pdf-tools .`       | Build the Docker image      |
| `docker run -p 3000:3000 pdf-tools` | Run container interactively |
| `docker compose up --build`         | Build & run with Compose    |
| `docker ps`                         | Show running containers     |
| `docker rm -f pdf-tools`            | Stop and remove container   |
