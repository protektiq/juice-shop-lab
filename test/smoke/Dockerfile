FROM node:18

# Set working directory
WORKDIR /app

# Copy all files
COPY . .

# Install dependencies
RUN npm install

# Expose the port Juice Shop runs on
EXPOSE 3000

# Start the app
CMD ["npm", "start"]
