FROM node:22-alpine

# Set working directory inside the container
WORKDIR /app

# Copy package files first (for better build caching)
COPY package*.json ./

# Install dependencies (only production deps if in production)
RUN npm ci --only=production

# Copy the rest of the application code
COPY . .

# Expose the port your app runs on
EXPOSE 5000
EXPOSE 9100

# Set NODE_ENV to production
ENV NODE_ENV=production

# Command to start the app
CMD ["npm", "start"]
