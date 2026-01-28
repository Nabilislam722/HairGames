module.exports = {
  apps: [
    {
      name: "backend-api",
      script: "node",
      args: "./backend/leaderboard.js",
      cwd: "O:/Projects/HemiGameX",
      env: {
        NODE_ENV: "development"
      }
    }
  ]
}
