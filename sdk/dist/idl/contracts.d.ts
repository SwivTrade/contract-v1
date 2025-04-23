/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/contracts.json`.
 */
export type Contracts = {
    "address": "2nga8op3u3j7Df7wsQv2n5hkRqjEFLjkWGGAfn4aHsfy";
    "metadata": {
        "name": "contracts";
        "version": "0.1.0";
        "spec": "0.1.0";
        "description": "Created with Anchor";
    };
    "instructions": [
        {
            "name": "createMarginAccount";
            "discriminator": [
                98,
                114,
                213,
                184,
                129,
                89,
                90,
                185
            ];
            "accounts": [
                {
                    "name": "owner";
                    "writable": true;
                    "signer": true;
                },
                {
                    "name": "marginAccount";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
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
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "owner";
                            },
                            {
                                "kind": "account";
                                "path": "market";
                            }
                        ];
                    };
                },
                {
                    "name": "market";
                },
                {
                    "name": "vault";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "account";
                                "path": "marginAccount";
                            },
                            {
                                "kind": "const";
                                "value": [
                                    6,
                                    221,
                                    246,
                                    225,
                                    215,
                                    101,
                                    161,
                                    147,
                                    217,
                                    203,
                                    225,
                                    70,
                                    206,
                                    235,
                                    121,
                                    172,
                                    28,
                                    180,
                                    133,
                                    237,
                                    95,
                                    91,
                                    55,
                                    145,
                                    58,
                                    140,
                                    245,
                                    133,
                                    126,
                                    255,
                                    0,
                                    169
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "mint";
                            }
                        ];
                        "program": {
                            "kind": "const";
                            "value": [
                                140,
                                151,
                                37,
                                143,
                                78,
                                36,
                                137,
                                241,
                                187,
                                61,
                                16,
                                41,
                                20,
                                142,
                                13,
                                131,
                                11,
                                90,
                                19,
                                153,
                                218,
                                255,
                                16,
                                132,
                                4,
                                142,
                                123,
                                216,
                                219,
                                233,
                                248,
                                89
                            ];
                        };
                    };
                },
                {
                    "name": "mint";
                },
                {
                    "name": "systemProgram";
                    "address": "11111111111111111111111111111111";
                },
                {
                    "name": "tokenProgram";
                    "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
                },
                {
                    "name": "associatedTokenProgram";
                    "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
                }
            ];
            "args": [
                {
                    "name": "bump";
                    "type": "u8";
                }
            ];
        },
        {
            "name": "depositCollateral";
            "discriminator": [
                156,
                131,
                142,
                116,
                146,
                247,
                162,
                120
            ];
            "accounts": [
                {
                    "name": "owner";
                    "writable": true;
                    "signer": true;
                },
                {
                    "name": "marginAccount";
                    "writable": true;
                },
                {
                    "name": "userTokenAccount";
                    "writable": true;
                },
                {
                    "name": "vault";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "account";
                                "path": "marginAccount";
                            },
                            {
                                "kind": "const";
                                "value": [
                                    6,
                                    221,
                                    246,
                                    225,
                                    215,
                                    101,
                                    161,
                                    147,
                                    217,
                                    203,
                                    225,
                                    70,
                                    206,
                                    235,
                                    121,
                                    172,
                                    28,
                                    180,
                                    133,
                                    237,
                                    95,
                                    91,
                                    55,
                                    145,
                                    58,
                                    140,
                                    245,
                                    133,
                                    126,
                                    255,
                                    0,
                                    169
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "mint";
                            }
                        ];
                        "program": {
                            "kind": "const";
                            "value": [
                                140,
                                151,
                                37,
                                143,
                                78,
                                36,
                                137,
                                241,
                                187,
                                61,
                                16,
                                41,
                                20,
                                142,
                                13,
                                131,
                                11,
                                90,
                                19,
                                153,
                                218,
                                255,
                                16,
                                132,
                                4,
                                142,
                                123,
                                216,
                                219,
                                233,
                                248,
                                89
                            ];
                        };
                    };
                },
                {
                    "name": "mint";
                },
                {
                    "name": "tokenProgram";
                    "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
                }
            ];
            "args": [
                {
                    "name": "amount";
                    "type": "u64";
                }
            ];
        },
        {
            "name": "initializeMarket";
            "discriminator": [
                35,
                35,
                189,
                193,
                155,
                48,
                170,
                203
            ];
            "accounts": [
                {
                    "name": "market";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    109,
                                    97,
                                    114,
                                    107,
                                    101,
                                    116
                                ];
                            },
                            {
                                "kind": "arg";
                                "path": "marketSymbol";
                            }
                        ];
                    };
                },
                {
                    "name": "authority";
                    "writable": true;
                    "signer": true;
                },
                {
                    "name": "oracleAccount";
                },
                {
                    "name": "systemProgram";
                    "address": "11111111111111111111111111111111";
                }
            ];
            "args": [
                {
                    "name": "marketSymbol";
                    "type": "string";
                },
                {
                    "name": "initialFundingRate";
                    "type": "i64";
                },
                {
                    "name": "fundingInterval";
                    "type": "i64";
                },
                {
                    "name": "maintenanceMarginRatio";
                    "type": "u64";
                },
                {
                    "name": "initialMarginRatio";
                    "type": "u64";
                },
                {
                    "name": "maxLeverage";
                    "type": "u64";
                },
                {
                    "name": "bump";
                    "type": "u8";
                }
            ];
        },
        {
            "name": "openPosition";
            "discriminator": [
                135,
                128,
                47,
                77,
                15,
                152,
                240,
                49
            ];
            "accounts": [
                {
                    "name": "market";
                    "writable": true;
                },
                {
                    "name": "position";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    112,
                                    111,
                                    115,
                                    105,
                                    116,
                                    105,
                                    111,
                                    110
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "market";
                            },
                            {
                                "kind": "account";
                                "path": "trader";
                            }
                        ];
                    };
                },
                {
                    "name": "trader";
                    "writable": true;
                    "signer": true;
                },
                {
                    "name": "priceUpdate";
                },
                {
                    "name": "systemProgram";
                    "address": "11111111111111111111111111111111";
                }
            ];
            "args": [
                {
                    "name": "side";
                    "type": {
                        "defined": {
                            "name": "side";
                        };
                    };
                },
                {
                    "name": "size";
                    "type": "u64";
                },
                {
                    "name": "leverage";
                    "type": "u64";
                },
                {
                    "name": "bump";
                    "type": "u8";
                }
            ];
        },
        {
            "name": "updateFundingPayments";
            "discriminator": [
                109,
                213,
                51,
                145,
                107,
                110,
                117,
                216
            ];
            "accounts": [
                {
                    "name": "market";
                    "writable": true;
                },
                {
                    "name": "authority";
                    "signer": true;
                }
            ];
            "args": [];
        },
        {
            "name": "updateFundingRate";
            "discriminator": [
                201,
                178,
                116,
                212,
                166,
                144,
                72,
                238
            ];
            "accounts": [
                {
                    "name": "market";
                    "writable": true;
                },
                {
                    "name": "authority";
                    "signer": true;
                    "relations": [
                        "market"
                    ];
                }
            ];
            "args": [
                {
                    "name": "newFundingRate";
                    "type": "i64";
                }
            ];
        },
        {
            "name": "withdrawCollateral";
            "discriminator": [
                115,
                135,
                168,
                106,
                139,
                214,
                138,
                150
            ];
            "accounts": [
                {
                    "name": "owner";
                    "writable": true;
                    "signer": true;
                },
                {
                    "name": "marginAccount";
                    "writable": true;
                },
                {
                    "name": "market";
                },
                {
                    "name": "userTokenAccount";
                    "writable": true;
                },
                {
                    "name": "vault";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "account";
                                "path": "marginAccount";
                            },
                            {
                                "kind": "const";
                                "value": [
                                    6,
                                    221,
                                    246,
                                    225,
                                    215,
                                    101,
                                    161,
                                    147,
                                    217,
                                    203,
                                    225,
                                    70,
                                    206,
                                    235,
                                    121,
                                    172,
                                    28,
                                    180,
                                    133,
                                    237,
                                    95,
                                    91,
                                    55,
                                    145,
                                    58,
                                    140,
                                    245,
                                    133,
                                    126,
                                    255,
                                    0,
                                    169
                                ];
                            },
                            {
                                "kind": "account";
                                "path": "mint";
                            }
                        ];
                        "program": {
                            "kind": "const";
                            "value": [
                                140,
                                151,
                                37,
                                143,
                                78,
                                36,
                                137,
                                241,
                                187,
                                61,
                                16,
                                41,
                                20,
                                142,
                                13,
                                131,
                                11,
                                90,
                                19,
                                153,
                                218,
                                255,
                                16,
                                132,
                                4,
                                142,
                                123,
                                216,
                                219,
                                233,
                                248,
                                89
                            ];
                        };
                    };
                },
                {
                    "name": "mint";
                },
                {
                    "name": "tokenProgram";
                    "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
                }
            ];
            "args": [
                {
                    "name": "amount";
                    "type": "u64";
                }
            ];
        }
    ];
    "accounts": [
        {
            "name": "marginAccount";
            "discriminator": [
                133,
                220,
                173,
                213,
                179,
                211,
                43,
                238
            ];
        },
        {
            "name": "market";
            "discriminator": [
                219,
                190,
                213,
                55,
                0,
                227,
                198,
                154
            ];
        },
        {
            "name": "position";
            "discriminator": [
                170,
                188,
                143,
                228,
                122,
                64,
                247,
                208
            ];
        },
        {
            "name": "priceUpdateV2";
            "discriminator": [
                34,
                241,
                35,
                99,
                157,
                126,
                244,
                205
            ];
        }
    ];
    "events": [
        {
            "name": "collateralDeposited";
            "discriminator": [
                244,
                62,
                77,
                11,
                135,
                112,
                61,
                96
            ];
        },
        {
            "name": "collateralWithdrawn";
            "discriminator": [
                51,
                224,
                133,
                106,
                74,
                173,
                72,
                82
            ];
        },
        {
            "name": "fundingRateUpdatedEvent";
            "discriminator": [
                223,
                34,
                205,
                106,
                34,
                251,
                158,
                76
            ];
        },
        {
            "name": "fundingUpdatedEvent";
            "discriminator": [
                30,
                80,
                188,
                77,
                115,
                123,
                191,
                126
            ];
        },
        {
            "name": "marginAccountCreated";
            "discriminator": [
                157,
                214,
                66,
                63,
                149,
                164,
                160,
                119
            ];
        },
        {
            "name": "marginAdjustedEvent";
            "discriminator": [
                215,
                144,
                150,
                101,
                181,
                168,
                194,
                93
            ];
        },
        {
            "name": "marketInitializedEvent";
            "discriminator": [
                70,
                173,
                96,
                202,
                100,
                143,
                45,
                25
            ];
        },
        {
            "name": "marketParamsUpdatedEvent";
            "discriminator": [
                159,
                73,
                27,
                179,
                194,
                219,
                7,
                230
            ];
        },
        {
            "name": "marketPausedEvent";
            "discriminator": [
                188,
                195,
                34,
                16,
                53,
                37,
                64,
                100
            ];
        },
        {
            "name": "marketResumedEvent";
            "discriminator": [
                34,
                56,
                120,
                78,
                71,
                228,
                93,
                131
            ];
        },
        {
            "name": "orderCancelledEvent";
            "discriminator": [
                200,
                73,
                179,
                145,
                247,
                176,
                10,
                101
            ];
        },
        {
            "name": "orderFilledEvent";
            "discriminator": [
                218,
                97,
                153,
                209,
                56,
                56,
                251,
                133
            ];
        },
        {
            "name": "orderPlacedEvent";
            "discriminator": [
                245,
                198,
                202,
                247,
                110,
                231,
                254,
                156
            ];
        },
        {
            "name": "positionClosedEvent";
            "discriminator": [
                76,
                129,
                10,
                225,
                238,
                51,
                158,
                126
            ];
        },
        {
            "name": "positionLiquidatedEvent";
            "discriminator": [
                70,
                153,
                226,
                254,
                176,
                139,
                225,
                72
            ];
        },
        {
            "name": "positionOpenedEvent";
            "discriminator": [
                163,
                1,
                92,
                149,
                138,
                188,
                177,
                23
            ];
        }
    ];
    "errors": [
        {
            "code": 6000;
            "name": "mathOverflow";
            "msg": "Math overflow occurred";
        },
        {
            "code": 6001;
            "name": "unauthorized";
            "msg": "Operation not authorized";
        },
        {
            "code": 6002;
            "name": "marketInactive";
            "msg": "Market is currently inactive";
        },
        {
            "code": 6003;
            "name": "positionClosed";
            "msg": "Position is already closed";
        },
        {
            "code": 6004;
            "name": "invalidOracleAccount";
            "msg": "Provided oracle account is invalid";
        },
        {
            "code": 6005;
            "name": "staleOraclePrice";
            "msg": "Oracle price is too old";
        },
        {
            "code": 6006;
            "name": "priceConfidenceTooLow";
            "msg": "Price confidence interval exceeds acceptable threshold";
        },
        {
            "code": 6007;
            "name": "positionNotLiquidatable";
            "msg": "Position does not meet liquidation criteria";
        },
        {
            "code": 6008;
            "name": "invalidOrderSize";
            "msg": "Order size is invalid";
        },
        {
            "code": 6009;
            "name": "invalidOrderPrice";
            "msg": "Order price is invalid";
        },
        {
            "code": 6010;
            "name": "leverageTooHigh";
            "msg": "Leverage exceeds maximum allowed";
        },
        {
            "code": 6011;
            "name": "insufficientMargin";
            "msg": "Insufficient margin provided";
        },
        {
            "code": 6012;
            "name": "invalidParameter";
            "msg": "Invalid parameter supplied";
        },
        {
            "code": 6013;
            "name": "marketAlreadyPaused";
            "msg": "Market is already paused";
        },
        {
            "code": 6014;
            "name": "marketAlreadyActive";
            "msg": "Market is already active";
        },
        {
            "code": 6015;
            "name": "orderNotActive";
            "msg": "Order is not active";
        },
        {
            "code": 6016;
            "name": "invalidMarketSymbol";
            "msg": "Invalid market symbol";
        },
        {
            "code": 6017;
            "name": "invalidFundingRate";
            "msg": "Invalid funding rate";
        },
        {
            "code": 6018;
            "name": "invalidFundingInterval";
            "msg": "Invalid funding interval";
        },
        {
            "code": 6019;
            "name": "invalidMarginRatio";
            "msg": "Invalid margin ratio";
        },
        {
            "code": 6020;
            "name": "invalidLeverage";
            "msg": "Invalid leverage value";
        },
        {
            "code": 6021;
            "name": "insufficientLiquidity";
            "msg": "Insufficient liquidity in market";
        },
        {
            "code": 6022;
            "name": "positionSizeTooSmall";
            "msg": "Position size is below minimum";
        },
        {
            "code": 6023;
            "name": "positionSizeTooLarge";
            "msg": "Position size exceeds maximum";
        },
        {
            "code": 6024;
            "name": "insufficientCollateral";
            "msg": "Insufficient collateral for this operation";
        },
        {
            "code": 6025;
            "name": "invalidLeverageRange";
            "msg": "Leverage is outside allowed range";
        },
        {
            "code": 6026;
            "name": "orderNotFound";
            "msg": "Order not found";
        },
        {
            "code": 6027;
            "name": "positionLiquidated";
            "msg": "Position has been liquidated";
        },
        {
            "code": 6028;
            "name": "marginCallRequired";
            "msg": "Margin call required before further operations";
        },
        {
            "code": 6029;
            "name": "withdrawalBelowMaintenanceMargin";
            "msg": "Withdrawal would put account below maintenance margin";
        },
        {
            "code": 6030;
            "name": "depositTooSmall";
            "msg": "Deposit amount is too small";
        },
        {
            "code": 6031;
            "name": "withdrawalTooSmall";
            "msg": "Withdrawal amount is too small";
        },
        {
            "code": 6032;
            "name": "invalidPosition";
            "msg": "Invalid position provided";
        }
    ];
    "types": [
        {
            "name": "collateralDeposited";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "owner";
                        "type": "pubkey";
                    },
                    {
                        "name": "marginAccount";
                        "type": "pubkey";
                    },
                    {
                        "name": "amount";
                        "type": "u64";
                    },
                    {
                        "name": "timestamp";
                        "type": "i64";
                    }
                ];
            };
        },
        {
            "name": "collateralWithdrawn";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "owner";
                        "type": "pubkey";
                    },
                    {
                        "name": "marginAccount";
                        "type": "pubkey";
                    },
                    {
                        "name": "amount";
                        "type": "u64";
                    },
                    {
                        "name": "timestamp";
                        "type": "i64";
                    }
                ];
            };
        },
        {
            "name": "fundingRateUpdatedEvent";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "market";
                        "type": "pubkey";
                    },
                    {
                        "name": "authority";
                        "type": "pubkey";
                    },
                    {
                        "name": "oldFundingRate";
                        "type": "i64";
                    },
                    {
                        "name": "newFundingRate";
                        "type": "i64";
                    }
                ];
            };
        },
        {
            "name": "fundingUpdatedEvent";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "market";
                        "type": "pubkey";
                    },
                    {
                        "name": "fundingRate";
                        "type": "i64";
                    },
                    {
                        "name": "intervals";
                        "type": "i64";
                    },
                    {
                        "name": "timestamp";
                        "type": "i64";
                    }
                ];
            };
        },
        {
            "name": "marginAccount";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "owner";
                        "type": "pubkey";
                    },
                    {
                        "name": "perpMarket";
                        "type": "pubkey";
                    },
                    {
                        "name": "collateral";
                        "type": "u64";
                    },
                    {
                        "name": "orders";
                        "type": {
                            "vec": "pubkey";
                        };
                    },
                    {
                        "name": "positions";
                        "type": {
                            "vec": "pubkey";
                        };
                    },
                    {
                        "name": "bump";
                        "type": "u8";
                    }
                ];
            };
        },
        {
            "name": "marginAccountCreated";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "owner";
                        "type": "pubkey";
                    },
                    {
                        "name": "marginAccount";
                        "type": "pubkey";
                    },
                    {
                        "name": "market";
                        "type": "pubkey";
                    },
                    {
                        "name": "timestamp";
                        "type": "i64";
                    }
                ];
            };
        },
        {
            "name": "marginAdjustedEvent";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "market";
                        "type": "pubkey";
                    },
                    {
                        "name": "position";
                        "type": "pubkey";
                    },
                    {
                        "name": "trader";
                        "type": "pubkey";
                    },
                    {
                        "name": "marginChange";
                        "type": "i64";
                    },
                    {
                        "name": "newCollateral";
                        "type": "u64";
                    }
                ];
            };
        },
        {
            "name": "market";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "authority";
                        "type": "pubkey";
                    },
                    {
                        "name": "marketSymbol";
                        "type": "string";
                    },
                    {
                        "name": "baseAssetReserve";
                        "type": "u64";
                    },
                    {
                        "name": "quoteAssetReserve";
                        "type": "u64";
                    },
                    {
                        "name": "fundingRate";
                        "type": "i64";
                    },
                    {
                        "name": "lastFundingTime";
                        "type": "i64";
                    },
                    {
                        "name": "fundingInterval";
                        "type": "i64";
                    },
                    {
                        "name": "maintenanceMarginRatio";
                        "type": "u64";
                    },
                    {
                        "name": "initialMarginRatio";
                        "type": "u64";
                    },
                    {
                        "name": "feePool";
                        "type": "u64";
                    },
                    {
                        "name": "insuranceFund";
                        "type": "u64";
                    },
                    {
                        "name": "maxLeverage";
                        "type": "u64";
                    },
                    {
                        "name": "oracle";
                        "type": "pubkey";
                    },
                    {
                        "name": "isActive";
                        "type": "bool";
                    },
                    {
                        "name": "bump";
                        "type": "u8";
                    }
                ];
            };
        },
        {
            "name": "marketInitializedEvent";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "market";
                        "type": "pubkey";
                    },
                    {
                        "name": "authority";
                        "type": "pubkey";
                    },
                    {
                        "name": "marketSymbol";
                        "type": "string";
                    },
                    {
                        "name": "fundingRate";
                        "type": "i64";
                    },
                    {
                        "name": "fundingInterval";
                        "type": "i64";
                    },
                    {
                        "name": "maintenanceMarginRatio";
                        "type": "u64";
                    },
                    {
                        "name": "initialMarginRatio";
                        "type": "u64";
                    },
                    {
                        "name": "maxLeverage";
                        "type": "u64";
                    }
                ];
            };
        },
        {
            "name": "marketParamsUpdatedEvent";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "market";
                        "type": "pubkey";
                    },
                    {
                        "name": "authority";
                        "type": "pubkey";
                    },
                    {
                        "name": "maintenanceMarginRatio";
                        "type": "u64";
                    },
                    {
                        "name": "initialMarginRatio";
                        "type": "u64";
                    },
                    {
                        "name": "fundingInterval";
                        "type": "i64";
                    },
                    {
                        "name": "maxLeverage";
                        "type": "u64";
                    }
                ];
            };
        },
        {
            "name": "marketPausedEvent";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "market";
                        "type": "pubkey";
                    },
                    {
                        "name": "authority";
                        "type": "pubkey";
                    }
                ];
            };
        },
        {
            "name": "marketResumedEvent";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "market";
                        "type": "pubkey";
                    },
                    {
                        "name": "authority";
                        "type": "pubkey";
                    }
                ];
            };
        },
        {
            "name": "orderCancelledEvent";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "market";
                        "type": "pubkey";
                    },
                    {
                        "name": "order";
                        "type": "pubkey";
                    },
                    {
                        "name": "trader";
                        "type": "pubkey";
                    }
                ];
            };
        },
        {
            "name": "orderFilledEvent";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "market";
                        "type": "pubkey";
                    },
                    {
                        "name": "order";
                        "type": "pubkey";
                    },
                    {
                        "name": "trader";
                        "type": "pubkey";
                    },
                    {
                        "name": "side";
                        "type": {
                            "defined": {
                                "name": "side";
                            };
                        };
                    },
                    {
                        "name": "price";
                        "type": "u64";
                    },
                    {
                        "name": "size";
                        "type": "u64";
                    },
                    {
                        "name": "filledSize";
                        "type": "u64";
                    }
                ];
            };
        },
        {
            "name": "orderPlacedEvent";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "market";
                        "type": "pubkey";
                    },
                    {
                        "name": "order";
                        "type": "pubkey";
                    },
                    {
                        "name": "trader";
                        "type": "pubkey";
                    },
                    {
                        "name": "side";
                        "type": {
                            "defined": {
                                "name": "side";
                            };
                        };
                    },
                    {
                        "name": "orderType";
                        "type": {
                            "defined": {
                                "name": "orderType";
                            };
                        };
                    },
                    {
                        "name": "price";
                        "type": "u64";
                    },
                    {
                        "name": "size";
                        "type": "u64";
                    },
                    {
                        "name": "leverage";
                        "type": "u64";
                    }
                ];
            };
        },
        {
            "name": "orderType";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "limit";
                    },
                    {
                        "name": "market";
                    },
                    {
                        "name": "stopLoss";
                    },
                    {
                        "name": "takeProfit";
                    }
                ];
            };
        },
        {
            "name": "position";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "trader";
                        "type": "pubkey";
                    },
                    {
                        "name": "market";
                        "type": "pubkey";
                    },
                    {
                        "name": "side";
                        "type": {
                            "defined": {
                                "name": "side";
                            };
                        };
                    },
                    {
                        "name": "size";
                        "type": "u64";
                    },
                    {
                        "name": "collateral";
                        "type": "u64";
                    },
                    {
                        "name": "entryPrice";
                        "type": "u64";
                    },
                    {
                        "name": "entryFundingRate";
                        "type": "i64";
                    },
                    {
                        "name": "leverage";
                        "type": "u64";
                    },
                    {
                        "name": "realizedPnl";
                        "type": "i64";
                    },
                    {
                        "name": "lastFundingPaymentTime";
                        "type": "i64";
                    },
                    {
                        "name": "lastCumulativeFunding";
                        "type": "i64";
                    },
                    {
                        "name": "liquidationPrice";
                        "type": "u64";
                    },
                    {
                        "name": "isOpen";
                        "type": "bool";
                    },
                    {
                        "name": "bump";
                        "type": "u8";
                    }
                ];
            };
        },
        {
            "name": "positionClosedEvent";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "market";
                        "type": "pubkey";
                    },
                    {
                        "name": "position";
                        "type": "pubkey";
                    },
                    {
                        "name": "trader";
                        "type": "pubkey";
                    },
                    {
                        "name": "side";
                        "type": {
                            "defined": {
                                "name": "side";
                            };
                        };
                    },
                    {
                        "name": "size";
                        "type": "u64";
                    },
                    {
                        "name": "collateral";
                        "type": "u64";
                    },
                    {
                        "name": "entryPrice";
                        "type": "u64";
                    },
                    {
                        "name": "exitPrice";
                        "type": "u64";
                    },
                    {
                        "name": "realizedPnl";
                        "type": "i64";
                    }
                ];
            };
        },
        {
            "name": "positionLiquidatedEvent";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "market";
                        "type": "pubkey";
                    },
                    {
                        "name": "position";
                        "type": "pubkey";
                    },
                    {
                        "name": "trader";
                        "type": "pubkey";
                    },
                    {
                        "name": "liquidator";
                        "type": "pubkey";
                    },
                    {
                        "name": "size";
                        "type": "u64";
                    },
                    {
                        "name": "collateral";
                        "type": "u64";
                    },
                    {
                        "name": "liquidationPrice";
                        "type": "u64";
                    },
                    {
                        "name": "liquidationFee";
                        "type": "u64";
                    }
                ];
            };
        },
        {
            "name": "positionOpenedEvent";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "market";
                        "type": "pubkey";
                    },
                    {
                        "name": "position";
                        "type": "pubkey";
                    },
                    {
                        "name": "trader";
                        "type": "pubkey";
                    },
                    {
                        "name": "side";
                        "type": {
                            "defined": {
                                "name": "side";
                            };
                        };
                    },
                    {
                        "name": "size";
                        "type": "u64";
                    },
                    {
                        "name": "collateral";
                        "type": "u64";
                    },
                    {
                        "name": "entryPrice";
                        "type": "u64";
                    },
                    {
                        "name": "leverage";
                        "type": "u64";
                    },
                    {
                        "name": "liquidationPrice";
                        "type": "u64";
                    }
                ];
            };
        },
        {
            "name": "priceFeedMessage";
            "repr": {
                "kind": "c";
            };
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "feedId";
                        "docs": [
                            "`FeedId` but avoid the type alias because of compatibility issues with Anchor's `idl-build` feature."
                        ];
                        "type": {
                            "array": [
                                "u8",
                                32
                            ];
                        };
                    },
                    {
                        "name": "price";
                        "type": "i64";
                    },
                    {
                        "name": "conf";
                        "type": "u64";
                    },
                    {
                        "name": "exponent";
                        "type": "i32";
                    },
                    {
                        "name": "publishTime";
                        "docs": [
                            "The timestamp of this price update in seconds"
                        ];
                        "type": "i64";
                    },
                    {
                        "name": "prevPublishTime";
                        "docs": [
                            "The timestamp of the previous price update. This field is intended to allow users to",
                            "identify the single unique price update for any moment in time:",
                            "for any time t, the unique update is the one such that prev_publish_time < t <= publish_time.",
                            "",
                            "Note that there may not be such an update while we are migrating to the new message-sending logic,",
                            "as some price updates on pythnet may not be sent to other chains (because the message-sending",
                            "logic may not have triggered). We can solve this problem by making the message-sending mandatory",
                            "(which we can do once publishers have migrated over).",
                            "",
                            "Additionally, this field may be equal to publish_time if the message is sent on a slot where",
                            "where the aggregation was unsuccesful. This problem will go away once all publishers have",
                            "migrated over to a recent version of pyth-agent."
                        ];
                        "type": "i64";
                    },
                    {
                        "name": "emaPrice";
                        "type": "i64";
                    },
                    {
                        "name": "emaConf";
                        "type": "u64";
                    }
                ];
            };
        },
        {
            "name": "priceUpdateV2";
            "docs": [
                "A price update account. This account is used by the Pyth Receiver program to store a verified price update from a Pyth price feed.",
                "It contains:",
                "- `write_authority`: The write authority for this account. This authority can close this account to reclaim rent or update the account to contain a different price update.",
                "- `verification_level`: The [`VerificationLevel`] of this price update. This represents how many Wormhole guardian signatures have been verified for this price update.",
                "- `price_message`: The actual price update.",
                "- `posted_slot`: The slot at which this price update was posted."
            ];
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "writeAuthority";
                        "type": "pubkey";
                    },
                    {
                        "name": "verificationLevel";
                        "type": {
                            "defined": {
                                "name": "verificationLevel";
                            };
                        };
                    },
                    {
                        "name": "priceMessage";
                        "type": {
                            "defined": {
                                "name": "priceFeedMessage";
                            };
                        };
                    },
                    {
                        "name": "postedSlot";
                        "type": "u64";
                    }
                ];
            };
        },
        {
            "name": "side";
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "long";
                    },
                    {
                        "name": "short";
                    }
                ];
            };
        },
        {
            "name": "verificationLevel";
            "docs": [
                "Pyth price updates are bridged to all blockchains via Wormhole.",
                "Using the price updates on another chain requires verifying the signatures of the Wormhole guardians.",
                "The usual process is to check the signatures for two thirds of the total number of guardians, but this can be cumbersome on Solana because of the transaction size limits,",
                "so we also allow for partial verification.",
                "",
                "This enum represents how much a price update has been verified:",
                "- If `Full`, we have verified the signatures for two thirds of the current guardians.",
                "- If `Partial`, only `num_signatures` guardian signatures have been checked.",
                "",
                "# Warning",
                "Using partially verified price updates is dangerous, as it lowers the threshold of guardians that need to collude to produce a malicious price update."
            ];
            "type": {
                "kind": "enum";
                "variants": [
                    {
                        "name": "partial";
                        "fields": [
                            {
                                "name": "numSignatures";
                                "type": "u8";
                            }
                        ];
                    },
                    {
                        "name": "full";
                    }
                ];
            };
        }
    ];
};
