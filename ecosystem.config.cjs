module.exports = {
  apps: [
    {
      name: "backend-api",
      script: "./backend/server.js",
      cwd: __dirname,
      env: {
        NODE_ENV: "development"
      }
    }
  ]
}
