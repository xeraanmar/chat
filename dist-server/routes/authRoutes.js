"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const authController_1 = require("../controllers/authController");
const router = express_1.default.Router();
router.post('/request-otp', authController_1.requestOTP);
router.post('/verify-otp', authController_1.verifyOTP);
router.post('/update-profile', authController_1.updateProfile);
exports.default = router;
