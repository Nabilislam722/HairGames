import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import routes from "./routes/index.js";
import { startNftWatcher } from "./services/nftWatcher.js";
import { provider } from "./config/provider.js";

dotenv.config();

const app = express();

app.use(cors({
  origin: ["http://127.0.0.1:5173", "https://127.0.0.1:5173"],
  methods: ['GET', 'POST'],
  credentials: true
}));

app.use(express.json());

// Connect to DB, Start Services, and Start Server
connectDB().then(() => {
  startNftWatcher(provider);
  
  app.use("/api", routes); // Mount all API routes under /api

  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
}).catch(err => {
  console.error("Failed to start server:", err);
});