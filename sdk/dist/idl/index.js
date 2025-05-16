"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.OracleIDL = exports.IDL = void 0;
var contracts_json_1 = require("./contracts.json");
Object.defineProperty(exports, "IDL", { enumerable: true, get: function () { return __importDefault(contracts_json_1).default; } });
var mock_oracle_json_1 = require("./mock_oracle.json");
Object.defineProperty(exports, "OracleIDL", { enumerable: true, get: function () { return __importDefault(mock_oracle_json_1).default; } });
