/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/contracts.json`.
 */
export type Contracts = {
  "address": "9wdJq5R7VUuXDrAZBnXfDqc1vW6nwAW5aYneMKiryppz",
  "metadata": {
    "name": "contracts",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "closeMarketOrder",
      "discriminator": [
        161,
        211,
        209,
        73,
        201,
        237,
        81,
        146
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "marginAccount",
          "writable": true
        },
        {
          "name": "trader",
          "writable": true,
          "signer": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "priceUpdate"
        }
      ],
      "args": []
    },
    {
      "name": "createMarginAccount",
      "discriminator": [
        98,
        114,
        213,
        184,
        129,
        89,
        90,
        185
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "marginAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  103,
                  105,
                  110,
                  95,
                  97,
                  99,
                  99,
                  111,
                  117,
                  110,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "owner"
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "market"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "marginType",
          "type": {
            "defined": {
              "name": "marginType"
            }
          }
        },
        {
          "name": "bump",
          "type": "u8"
        }
      ]
    },
    {
      "name": "depositCollateral",
      "discriminator": [
        156,
        131,
        142,
        116,
        146,
        247,
        162,
        120
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "marginAccount",
          "writable": true
        },
        {
          "name": "market"
        },
        {
          "name": "userTokenAccount",
          "writable": true
        },
        {
          "name": "marketVault",
          "writable": true
        },
        {
          "name": "mint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initializeMarket",
      "discriminator": [
        35,
        35,
        189,
        193,
        155,
        48,
        170,
        203
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  97,
                  114,
                  107,
                  101,
                  116
                ]
              },
              {
                "kind": "arg",
                "path": "marketSymbol"
              }
            ]
          }
        },
        {
          "name": "authority",
          "writable": true,
          "signer": true
        },
        {
          "name": "oracleAccount"
        },
        {
          "name": "mint",
          "docs": [
            "The token mint for the market's collateral"
          ]
        },
        {
          "name": "vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "market"
              }
            ]
          }
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "marketSymbol",
          "type": "string"
        },
        {
          "name": "initialFundingRate",
          "type": "i64"
        },
        {
          "name": "fundingInterval",
          "type": "i64"
        },
        {
          "name": "maintenanceMarginRatio",
          "type": "u64"
        },
        {
          "name": "initialMarginRatio",
          "type": "u64"
        },
        {
          "name": "maxLeverage",
          "type": "u64"
        },
        {
          "name": "liquidationFeeRatio",
          "type": "u64"
        },
        {
          "name": "bump",
          "type": "u8"
        }
      ]
    },
    {
      "name": "liquidateMarketOrder",
      "discriminator": [
        53,
        184,
        12,
        203,
        182,
        112,
        199,
        146
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true,
          "relations": [
            "position"
          ]
        },
        {
          "name": "position",
          "writable": true
        },
        {
          "name": "marginAccount",
          "writable": true
        },
        {
          "name": "liquidator",
          "writable": true,
          "signer": true
        },
        {
          "name": "priceUpdate"
        }
      ],
      "args": []
    },
    {
      "name": "pauseMarket",
      "discriminator": [
        216,
        238,
        4,
        164,
        65,
        11,
        162,
        91
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "market"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "placeMarketOrder",
      "discriminator": [
        90,
        118,
        192,
        252,
        192,
        99,
        39,
        145
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "position",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "market"
              },
              {
                "kind": "account",
                "path": "trader"
              },
              {
                "kind": "arg",
                "path": "uid"
              }
            ]
          }
        },
        {
          "name": "marginAccount",
          "writable": true
        },
        {
          "name": "trader",
          "writable": true,
          "signer": true
        },
        {
          "name": "priceUpdate"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "side",
          "type": {
            "defined": {
              "name": "side"
            }
          }
        },
        {
          "name": "size",
          "type": "u64"
        },
        {
          "name": "leverage",
          "type": "u64"
        },
        {
          "name": "positionBump",
          "type": "u8"
        },
        {
          "name": "uid",
          "type": "u64"
        }
      ]
    },
    {
      "name": "resumeMarket",
      "discriminator": [
        198,
        120,
        104,
        87,
        44,
        103,
        108,
        143
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "market"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "updateFundingPayments",
      "discriminator": [
        109,
        213,
        51,
        145,
        107,
        110,
        117,
        216
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true
        }
      ],
      "args": []
    },
    {
      "name": "updateFundingRate",
      "discriminator": [
        201,
        178,
        116,
        212,
        166,
        144,
        72,
        238
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "market"
          ]
        }
      ],
      "args": [
        {
          "name": "newFundingRate",
          "type": "i64"
        }
      ]
    },
    {
      "name": "updateMarketParams",
      "discriminator": [
        70,
        117,
        202,
        191,
        205,
        174,
        92,
        82
      ],
      "accounts": [
        {
          "name": "market",
          "writable": true
        },
        {
          "name": "authority",
          "signer": true,
          "relations": [
            "market"
          ]
        }
      ],
      "args": [
        {
          "name": "maintenanceMarginRatio",
          "type": {
            "option": "u64"
          }
        },
        {
          "name": "initialMarginRatio",
          "type": {
            "option": "u64"
          }
        },
        {
          "name": "fundingInterval",
          "type": {
            "option": "i64"
          }
        },
        {
          "name": "maxLeverage",
          "type": {
            "option": "u64"
          }
        }
      ]
    },
    {
      "name": "withdrawCollateral",
      "discriminator": [
        115,
        135,
        168,
        106,
        139,
        214,
        138,
        150
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "marginAccount",
          "writable": true
        },
        {
          "name": "market"
        },
        {
          "name": "userTokenAccount",
          "writable": true
        },
        {
          "name": "marketVault",
          "writable": true
        },
        {
          "name": "mint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "marginAccount",
      "discriminator": [
        133,
        220,
        173,
        213,
        179,
        211,
        43,
        238
      ]
    },
    {
      "name": "market",
      "discriminator": [
        219,
        190,
        213,
        55,
        0,
        227,
        198,
        154
      ]
    },
    {
      "name": "position",
      "discriminator": [
        170,
        188,
        143,
        228,
        122,
        64,
        247,
        208
      ]
    }
  ],
  "events": [
    {
      "name": "collateralDeposited",
      "discriminator": [
        244,
        62,
        77,
        11,
        135,
        112,
        61,
        96
      ]
    },
    {
      "name": "collateralWithdrawn",
      "discriminator": [
        51,
        224,
        133,
        106,
        74,
        173,
        72,
        82
      ]
    },
    {
      "name": "fundingRateUpdatedEvent",
      "discriminator": [
        223,
        34,
        205,
        106,
        34,
        251,
        158,
        76
      ]
    },
    {
      "name": "fundingUpdatedEvent",
      "discriminator": [
        30,
        80,
        188,
        77,
        115,
        123,
        191,
        126
      ]
    },
    {
      "name": "marginAccountCreated",
      "discriminator": [
        157,
        214,
        66,
        63,
        149,
        164,
        160,
        119
      ]
    },
    {
      "name": "marginAdjustedEvent",
      "discriminator": [
        215,
        144,
        150,
        101,
        181,
        168,
        194,
        93
      ]
    },
    {
      "name": "marketInitializedEvent",
      "discriminator": [
        70,
        173,
        96,
        202,
        100,
        143,
        45,
        25
      ]
    },
    {
      "name": "marketParamsUpdatedEvent",
      "discriminator": [
        159,
        73,
        27,
        179,
        194,
        219,
        7,
        230
      ]
    },
    {
      "name": "marketPausedEvent",
      "discriminator": [
        188,
        195,
        34,
        16,
        53,
        37,
        64,
        100
      ]
    },
    {
      "name": "marketResumedEvent",
      "discriminator": [
        34,
        56,
        120,
        78,
        71,
        228,
        93,
        131
      ]
    },
    {
      "name": "orderCancelledEvent",
      "discriminator": [
        200,
        73,
        179,
        145,
        247,
        176,
        10,
        101
      ]
    },
    {
      "name": "orderFilledEvent",
      "discriminator": [
        218,
        97,
        153,
        209,
        56,
        56,
        251,
        133
      ]
    },
    {
      "name": "orderPlacedEvent",
      "discriminator": [
        245,
        198,
        202,
        247,
        110,
        231,
        254,
        156
      ]
    },
    {
      "name": "positionClosedEvent",
      "discriminator": [
        76,
        129,
        10,
        225,
        238,
        51,
        158,
        126
      ]
    },
    {
      "name": "positionLiquidatedEvent",
      "discriminator": [
        70,
        153,
        226,
        254,
        176,
        139,
        225,
        72
      ]
    },
    {
      "name": "positionOpenedEvent",
      "discriminator": [
        163,
        1,
        92,
        149,
        138,
        188,
        177,
        23
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "mathOverflow",
      "msg": "Math overflow occurred"
    },
    {
      "code": 6001,
      "name": "unauthorized",
      "msg": "Operation not authorized"
    },
    {
      "code": 6002,
      "name": "marketInactive",
      "msg": "Market is currently inactive"
    },
    {
      "code": 6003,
      "name": "positionClosed",
      "msg": "Position is already closed"
    },
    {
      "code": 6004,
      "name": "invalidOracleAccount",
      "msg": "Provided oracle account is invalid"
    },
    {
      "code": 6005,
      "name": "staleOraclePrice",
      "msg": "Oracle price is too old"
    },
    {
      "code": 6006,
      "name": "priceConfidenceTooLow",
      "msg": "Price confidence interval exceeds acceptable threshold"
    },
    {
      "code": 6007,
      "name": "positionNotLiquidatable",
      "msg": "Position does not meet liquidation criteria"
    },
    {
      "code": 6008,
      "name": "invalidOrderSize",
      "msg": "Order size is invalid"
    },
    {
      "code": 6009,
      "name": "invalidOrderPrice",
      "msg": "Order price is invalid"
    },
    {
      "code": 6010,
      "name": "leverageTooHigh",
      "msg": "Leverage exceeds maximum allowed"
    },
    {
      "code": 6011,
      "name": "insufficientMargin",
      "msg": "Insufficient margin provided"
    },
    {
      "code": 6012,
      "name": "invalidParameter",
      "msg": "Invalid parameter supplied"
    },
    {
      "code": 6013,
      "name": "marketAlreadyPaused",
      "msg": "Market is already paused"
    },
    {
      "code": 6014,
      "name": "marketAlreadyActive",
      "msg": "Market is already active"
    },
    {
      "code": 6015,
      "name": "orderNotActive",
      "msg": "Order is not active"
    },
    {
      "code": 6016,
      "name": "invalidMarketSymbol",
      "msg": "Invalid market symbol"
    },
    {
      "code": 6017,
      "name": "invalidFundingRate",
      "msg": "Invalid funding rate"
    },
    {
      "code": 6018,
      "name": "invalidFundingInterval",
      "msg": "Invalid funding interval"
    },
    {
      "code": 6019,
      "name": "invalidMarginRatio",
      "msg": "Invalid margin ratio"
    },
    {
      "code": 6020,
      "name": "invalidLeverage",
      "msg": "Invalid leverage value"
    },
    {
      "code": 6021,
      "name": "insufficientLiquidity",
      "msg": "Insufficient liquidity in market"
    },
    {
      "code": 6022,
      "name": "positionSizeTooSmall",
      "msg": "Position size is below minimum"
    },
    {
      "code": 6023,
      "name": "positionSizeTooLarge",
      "msg": "Position size exceeds maximum"
    },
    {
      "code": 6024,
      "name": "insufficientCollateral",
      "msg": "Insufficient collateral for this operation"
    },
    {
      "code": 6025,
      "name": "invalidLeverageRange",
      "msg": "Leverage is outside allowed range"
    },
    {
      "code": 6026,
      "name": "orderNotFound",
      "msg": "Order not found"
    },
    {
      "code": 6027,
      "name": "positionLiquidated",
      "msg": "Position has been liquidated"
    },
    {
      "code": 6028,
      "name": "marginCallRequired",
      "msg": "Margin call required before further operations"
    },
    {
      "code": 6029,
      "name": "withdrawalBelowMaintenanceMargin",
      "msg": "Withdrawal would put account below maintenance margin"
    },
    {
      "code": 6030,
      "name": "depositTooSmall",
      "msg": "Deposit amount is too small"
    },
    {
      "code": 6031,
      "name": "withdrawalTooSmall",
      "msg": "Withdrawal amount is too small"
    },
    {
      "code": 6032,
      "name": "invalidPosition",
      "msg": "Invalid position provided"
    },
    {
      "code": 6033,
      "name": "withdrawalExceedsAvailableMargin",
      "msg": "Withdrawal exceeds available margin"
    },
    {
      "code": 6034,
      "name": "invalidVault",
      "msg": "Invalid vault provided"
    }
  ],
  "types": [
    {
      "name": "collateralDeposited",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "marginAccount",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "collateralWithdrawn",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "marginAccount",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "fundingRateUpdatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "oldFundingRate",
            "type": "i64"
          },
          {
            "name": "newFundingRate",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "fundingUpdatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "fundingRate",
            "type": "i64"
          },
          {
            "name": "intervals",
            "type": "i64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "marginAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "perpMarket",
            "type": "pubkey"
          },
          {
            "name": "marginType",
            "type": {
              "defined": {
                "name": "marginType"
              }
            }
          },
          {
            "name": "collateral",
            "type": "u64"
          },
          {
            "name": "allocatedMargin",
            "type": "u64"
          },
          {
            "name": "positions",
            "type": {
              "vec": "pubkey"
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "marginAccountCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "marginAccount",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "marginType",
            "type": {
              "defined": {
                "name": "marginType"
              }
            }
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "marginAdjustedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "marginChange",
            "type": "i64"
          },
          {
            "name": "newCollateral",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "marginType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "isolated"
          },
          {
            "name": "cross"
          }
        ]
      }
    },
    {
      "name": "market",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "marketSymbol",
            "type": "string"
          },
          {
            "name": "baseAssetReserve",
            "type": "u64"
          },
          {
            "name": "quoteAssetReserve",
            "type": "u64"
          },
          {
            "name": "fundingRate",
            "type": "i64"
          },
          {
            "name": "lastFundingTime",
            "type": "i64"
          },
          {
            "name": "fundingInterval",
            "type": "i64"
          },
          {
            "name": "maintenanceMarginRatio",
            "type": "u64"
          },
          {
            "name": "initialMarginRatio",
            "type": "u64"
          },
          {
            "name": "liquidationFeeRatio",
            "type": "u64"
          },
          {
            "name": "feePool",
            "type": "u64"
          },
          {
            "name": "insuranceFund",
            "type": "u64"
          },
          {
            "name": "maxLeverage",
            "type": "u64"
          },
          {
            "name": "oracle",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "isActive",
            "type": "bool"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "marketInitializedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "marketSymbol",
            "type": "string"
          },
          {
            "name": "fundingRate",
            "type": "i64"
          },
          {
            "name": "fundingInterval",
            "type": "i64"
          },
          {
            "name": "maintenanceMarginRatio",
            "type": "u64"
          },
          {
            "name": "initialMarginRatio",
            "type": "u64"
          },
          {
            "name": "maxLeverage",
            "type": "u64"
          },
          {
            "name": "liquidationFeeRatio",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "marketParamsUpdatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "maintenanceMarginRatio",
            "type": "u64"
          },
          {
            "name": "initialMarginRatio",
            "type": "u64"
          },
          {
            "name": "fundingInterval",
            "type": "i64"
          },
          {
            "name": "maxLeverage",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "marketPausedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "marketResumedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "authority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "orderCancelledEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "order",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "orderFilledEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "side"
              }
            }
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "size",
            "type": "u64"
          },
          {
            "name": "filledSize",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "orderPlacedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "side"
              }
            }
          },
          {
            "name": "orderType",
            "type": {
              "defined": {
                "name": "orderType"
              }
            }
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "size",
            "type": "u64"
          },
          {
            "name": "leverage",
            "type": "u64"
          },
          {
            "name": "timestamp",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "orderType",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "market"
          },
          {
            "name": "limit"
          }
        ]
      }
    },
    {
      "name": "position",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "orderType",
            "type": {
              "defined": {
                "name": "orderType"
              }
            }
          },
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "side"
              }
            }
          },
          {
            "name": "size",
            "type": "u64"
          },
          {
            "name": "filledSize",
            "type": "u64"
          },
          {
            "name": "price",
            "type": "u64"
          },
          {
            "name": "collateral",
            "type": "u64"
          },
          {
            "name": "entryPrice",
            "type": "u64"
          },
          {
            "name": "entryFundingRate",
            "type": "i64"
          },
          {
            "name": "leverage",
            "type": "u64"
          },
          {
            "name": "realizedPnl",
            "type": "i64"
          },
          {
            "name": "lastFundingPaymentTime",
            "type": "i64"
          },
          {
            "name": "lastCumulativeFunding",
            "type": "i64"
          },
          {
            "name": "isOpen",
            "type": "bool"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "positionClosedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "side"
              }
            }
          },
          {
            "name": "size",
            "type": "u64"
          },
          {
            "name": "collateral",
            "type": "u64"
          },
          {
            "name": "entryPrice",
            "type": "u64"
          },
          {
            "name": "exitPrice",
            "type": "u64"
          },
          {
            "name": "realizedPnl",
            "type": "i64"
          },
          {
            "name": "marginType",
            "type": {
              "defined": {
                "name": "marginType"
              }
            }
          }
        ]
      }
    },
    {
      "name": "positionLiquidatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "side"
              }
            }
          },
          {
            "name": "size",
            "type": "u64"
          },
          {
            "name": "collateral",
            "type": "u64"
          },
          {
            "name": "entryPrice",
            "type": "u64"
          },
          {
            "name": "exitPrice",
            "type": "u64"
          },
          {
            "name": "liquidator",
            "type": "pubkey"
          },
          {
            "name": "liquidationFee",
            "type": "u64"
          },
          {
            "name": "liquidatorFee",
            "type": "u64"
          },
          {
            "name": "insuranceFundFee",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "positionOpenedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "market",
            "type": "pubkey"
          },
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "trader",
            "type": "pubkey"
          },
          {
            "name": "side",
            "type": {
              "defined": {
                "name": "side"
              }
            }
          },
          {
            "name": "size",
            "type": "u64"
          },
          {
            "name": "collateral",
            "type": "u64"
          },
          {
            "name": "entryPrice",
            "type": "u64"
          },
          {
            "name": "leverage",
            "type": "u64"
          },
          {
            "name": "liquidationPrice",
            "type": "u64"
          },
          {
            "name": "marginType",
            "type": {
              "defined": {
                "name": "marginType"
              }
            }
          }
        ]
      }
    },
    {
      "name": "side",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "long"
          },
          {
            "name": "short"
          }
        ]
      }
    }
  ]
};
