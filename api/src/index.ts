import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import { createAuthRouter } from "./routes/auth.js";
import { createProfileRouter } from "./routes/profile.js";
import { createAdminRouter } from "./routes/admin.js";
import { createCellarsRouter } from "./routes/cellars.js";
import { createBottlesRouter } from "./routes/bottles.js";
import { DatabaseService } from "./services/database.js";
import { UserService, TwoFAService, SessionService, SecurityEventService } from "./services/auth.js";
import { ProfileService, AppSettingsService } from "./services/profile.js";
import { CellarService } from "./services/cellars.js";
import { BottleService } from "./services/bottles.js";
import { logger } from "./utils/logger.js";
import { createConsumptionPlanRouter } from "./routes/consumptionPlan.js";
import { createFoodPairingRouter } from "./routes/foodPairing.js";
import { createImagesRouter } from "./routes/images.js";


// Log any uncaught exceptions or unhandled promise rejections
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught Exception');
  // eslint-disable-next-line no-console
  console.error('Uncaught Exception', err);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled Rejection');
  // eslint-disable-next-line no-console
  console.error('Unhandled Rejection', reason);
  process.exit(1);
});

dotenv.config();

const app = express();
const PORT = process.env.API_PORT || 3001;

// Initialize database service with error logging
let dbService: DatabaseService;
try {
  dbService = new DatabaseService();
  logger.info("DatabaseService initialized successfully");
} catch (err) {
  logger.fatal({ err }, "Fatal error during DatabaseService initialization");
  // eslint-disable-next-line no-console
  console.error("Fatal error during DatabaseService initialization", err);
  process.exit(1);
}

// Initialize services
const userService = new UserService(dbService);
const twoFAService = new TwoFAService(dbService);
const sessionService = new SessionService(dbService);
const securityEventService = new SecurityEventService(dbService);
const profileService = new ProfileService(dbService);
const appSettingsService = new AppSettingsService(dbService);
const cellarService = new CellarService(dbService);
const bottleService = new BottleService(dbService);

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser());

// CORS configuration with explicit credentials handling
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    exposedHeaders: ["Set-Cookie"],
  })
);

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use(
  "/api/auth",
  createAuthRouter(userService, twoFAService, sessionService, securityEventService)
);

app.use("/api/profile", createProfileRouter(sessionService, profileService, appSettingsService));

app.use(
  "/api/admin",
  createAdminRouter(sessionService, userService, profileService, appSettingsService)
);

// Cellars router
const cellarsRouter = createCellarsRouter(sessionService, cellarService);
app.use("/api/cellars", cellarsRouter);

// Bottles router
const bottlesRouter = createBottlesRouter(sessionService, bottleService);
app.use("/api/bottles", bottlesRouter);

// Consumption plan router

const consumptionPlanRouter = createConsumptionPlanRouter(sessionService, bottleService);
app.use("/api/consumption-plan", consumptionPlanRouter);

const foodPairingRouter = createFoodPairingRouter(sessionService, profileService, appSettingsService);
app.use("/api/food-pairing", foodPairingRouter);

const imagesRouter = createImagesRouter(sessionService);
app.use("/api/images", imagesRouter);


// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Not found" });
});

// Error handler
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error({ err, path: req.path, method: req.method }, "Unhandled error");
  res.status(err.status || 500).json({
    error: err.message || "Internal server error",
  });
});

app.listen(PORT, () => {
  logger.info(`API server running on port ${PORT}`);
});
