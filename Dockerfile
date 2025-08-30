FROM node:22-alpine

# Create the bot directory
RUN mkdir -p /usr/bot/dist
WORKDIR /usr/bot

# Copy and install bot dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy .env
COPY .env ./dist

# Copy the bot itself (Static Fallback)
COPY dist/ ./dist

# Run the bot
WORKDIR ./dist
RUN mkdir -p ./commands/public ./commands/dev ./tasks/public ./tasks/dev ./data ./temp
CMD ["node", "--env-file=.env", "main.js"]