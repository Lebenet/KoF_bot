# KoF_bot

Bot officiel du Royaume de France pour BitCraft Online.

## To Run (at project root):

You must add a .env file at project root, with the following format:

```bash
BOT_TOKEN="<your_bot_token>"
CLIENT_ID="<your_discord_application_id>"
GUILD_ID="<your_public_discord_server_id>"
DEV_GUILD_ID="<your_dev_discord_server_id>" # Optional
```

If you want to add global bot admins to your bot config,  
you can do so by adding `admins.json` to `/src/data`.  
Must follow the format `["<discord_id>", "<discord_id>", ...]`

Linux:

- `chmod +x ./run.sh` _(optional, if script isn't auth to execute)_
- `./run.sh`

Windows:

- Just use linux (or wsl with Docker Desktop on Windows)

## Required:

- Docker
- npm
    - npx _(automatically installed if npm v5.2.0 or above)_

## Optional _(for messing around with the DB outside the bot)_

- SQLite3
