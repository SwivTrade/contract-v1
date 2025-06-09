/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/mock_oracle.json`.
 */
export type MockOracle = {
    "address": "BXUz2F4tTUvDVoH56FS1akittkNrsYHzqj7XAeSA1mTx";
    "metadata": {
        "name": "mockOracle";
        "version": "0.1.0";
        "spec": "0.1.0";
        "description": "Created with Anchor";
    };
    "instructions": [
        {
            "name": "initialize";
            "discriminator": [
                175,
                175,
                109,
                31,
                13,
                152,
                155,
                237
            ];
            "accounts": [
                {
                    "name": "oracle";
                    "writable": true;
                    "pda": {
                        "seeds": [
                            {
                                "kind": "const";
                                "value": [
                                    111,
                                    114,
                                    97,
                                    99,
                                    108,
                                    101
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
                    "name": "initialPrice";
                    "type": "u64";
                }
            ];
        },
        {
            "name": "updatePrice";
            "discriminator": [
                61,
                34,
                117,
                155,
                75,
                34,
                123,
                208
            ];
            "accounts": [
                {
                    "name": "oracle";
                    "writable": true;
                },
                {
                    "name": "authority";
                    "signer": true;
                }
            ];
            "args": [
                {
                    "name": "newPrice";
                    "type": "u64";
                }
            ];
        }
    ];
    "accounts": [
        {
            "name": "oracle";
            "discriminator": [
                139,
                194,
                131,
                179,
                140,
                179,
                229,
                244
            ];
        }
    ];
    "errors": [
        {
            "code": 6000;
            "name": "unauthorized";
            "msg": "unauthorized";
        }
    ];
    "types": [
        {
            "name": "oracle";
            "type": {
                "kind": "struct";
                "fields": [
                    {
                        "name": "price";
                        "type": "u64";
                    },
                    {
                        "name": "authority";
                        "type": "pubkey";
                    },
                    {
                        "name": "timestamp";
                        "type": "i64";
                    }
                ];
            };
        }
    ];
};
