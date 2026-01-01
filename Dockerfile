FROM node:20-alpine

WORKDIR /app

# Install system dependencies
RUN apk add --no-cache openssl ca-certificates

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json ./

# Copy Prisma schema
COPY prisma ./prisma/

# Install dependencies
RUN pnpm install

# Copy source code
COPY . .

# Build frontend & backend
RUN pnpm run build

# Make start script executable
RUN chmod +x start.sh

# Expose port
EXPOSE 3001

# Use start.sh as the entrypoint
CMD ["./start.sh"]
