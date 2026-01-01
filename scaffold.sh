#!/bin/bash
set -e

# Initialize project directory
cd /home/ubuntu/telegram-ultimate-clone

# Initialize package.json
npm init -y

# Install dependencies
pnpm add react react-dom framer-motion lucide-react socket.io-client axios clsx tailwind-merge react-router-dom
pnpm add -D vite @vitejs/plugin-react tailwindcss @tailwindcss/vite typescript @types/react @types/react-dom @types/node

# Create directory structure
mkdir -p client/src/{components/ui,pages,hooks,contexts,lib,assets}
mkdir -p client/public
mkdir -p server/{routes,controllers,models,middleware,config}
mkdir -p shared

# Create basic files
touch client/index.html
touch client/src/main.tsx
touch client/src/App.tsx
touch client/src/index.css
touch vite.config.ts
touch tailwind.config.js
touch server/index.ts

echo "Scaffolding complete."
