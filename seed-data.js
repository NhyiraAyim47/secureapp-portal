/**
 * SecureApp Mobile - Bundled Enterprise Dataset & Offline Seed Store
 * Extracted directly from live Firestore database export.
 * Enables 100% standalone offline operation on iOS devices.
 */
(function(window) {
    "use strict";

    window.DEFAULT_SEED_USERS = [
    {
        "two_factor_secret": "EPZ6BPPAVWCD6NF3KSEG3N5EHOXMQLQR",
        "recoveryCodes": [
            "RECOV-003",
            "RECOV-004",
            "RECOV-005"
        ],
        "salt": "e7f8a1b2c3d4e5f67890abcdef123456",
        "twoFactorSecret": "EPZ6BPPAVWCD6NF3KSEG3N5EHOXMQLQR",
        "createdAt": "2026-10-24T20:21:30.259Z",
        "name": "Timah Esther (Super Admin)",
        "id": "usr_admin_001",
        "updatedAt": "2026-10-24T20:24:17.012Z",
        "email": "admin@example.com",
        "department": null,
        "twoFactorEnabled": true,
        "passwordHash": "v2$12$e7f8a1b2c3d4e5f67890abcdef123456$ef207f43c96e4fcda6cdada471aa6e728b9b423280ea653a8eff86a84bfe61fb",
        "status": "active",
        "recovery_codes": [
            "RECOV-003",
            "RECOV-004",
            "RECOV-005"
        ],
        "role": "super_admin",
        "two_factor_enabled": 1
    },
    {
        "name": "Alice Mensah",
        "twoFactorSecret": null,
        "updatedAt": "2026-10-24T20:21:23.839Z",
        "passwordHash": "v2$12$7a9f1b2c3d4e5f608192a3b4c5d6e7f8$410487c53656b9694ed79d5b17453ac8c600ff6a4742da17882719210ce8cb1c",
        "id": "usr_alice_001",
        "status": "active",
        "department": "Marketing",
        "salt": "7a9f1b2c3d4e5f608192a3b4c5d6e7f8",
        "twoFactorEnabled": false,
        "email": "alice@tim-mfg.com",
        "role": "user",
        "deletedAt": null,
        "deleted_at": null,
        "createdAt": "2026-10-24T20:21:23.838Z",
        "two_factor_enabled": 0,
        "two_factor_secret": null,
        "recovery_codes": [],
        "recoveryCodes": []
    },
    {
        "role": "user",
        "passwordHash": "v2$12$7266e809c3eb3e1317ab028da476d794$ea452da2bc02fe76c3ae3521bb51244574fe4e7d2174d135715eb3a236759a4a",
        "email": "ayimnhyirahamos@gmail.com",
        "updatedAt": "2026-10-24T20:10:47.043Z",
        "two_factor_secret": "LJRD4GWKY2GNSRTRVNOSZQL4PYS5DJTC",
        "twoFactorEnabled": true,
        "name": "Amos Oware",
        "createdAt": "2026-10-24T06:48:56.710Z",
        "two_factor_enabled": 1,
        "twoFactorSecret": "LJRD4GWKY2GNSRTRVNOSZQL4PYS5DJTC",
        "department": "IT",
        "salt": "7266e809c3eb3e1317ab028da476d794",
        "status": "active",
        "recovery_codes": [],
        "recoveryCodes": []
    },
    {
        "department": "Sales",
        "role": "user",
        "updatedAt": "2026-10-24T20:21:29.384Z",
        "status": "active",
        "email": "bob@tim-mfg.com",
        "name": "Bob Quaye",
        "deletedAt": null,
        "twoFactorEnabled": false,
        "passwordHash": "v2$12$b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8$933a04338fbaa045d3345acd3d57363d4c907ab8cef451dec676092668708cb7",
        "deleted_at": null,
        "twoFactorSecret": null,
        "salt": "b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8",
        "createdAt": "2026-10-24T20:21:29.384Z",
        "id": "usr_bob_002",
        "two_factor_enabled": 0,
        "two_factor_secret": null,
        "recovery_codes": [],
        "recoveryCodes": []
    },
    {
        "salt": "1d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a",
        "email": "charlie@tim-mfg.com",
        "createdAt": "2026-10-24T20:21:29.647Z",
        "status": "active",
        "twoFactorEnabled": false,
        "twoFactorSecret": null,
        "id": "usr_charlie_003",
        "name": "Charlie Antwi",
        "passwordHash": "v2$12$1d8e7f6a5b4c3d2e1f0a9b8c7d6e5f4a$b182616238f7ccbd326e288d43bfe5bd829aeec9a4c60daa4f31fc87145d86ba",
        "department": "IT",
        "role": "user",
        "updatedAt": "2026-10-24T20:21:29.647Z",
        "two_factor_enabled": 0,
        "two_factor_secret": null,
        "recovery_codes": [],
        "recoveryCodes": []
    },
    {
        "id": "usr_david_004",
        "twoFactorSecret": null,
        "department": "Logistics",
        "twoFactorEnabled": false,
        "updatedAt": "2026-10-24T20:21:29.858Z",
        "passwordHash": "v2$12$f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4$50beb7d49e59855d8608caa9f78489e9f92fb20762590f719404b78a96283dfe",
        "name": "David Osei",
        "role": "user",
        "salt": "f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4",
        "status": "active",
        "email": "david@tim-mfg.com",
        "createdAt": "2026-10-24T20:21:29.858Z",
        "two_factor_enabled": 0,
        "two_factor_secret": null,
        "recovery_codes": [],
        "recoveryCodes": []
    },
    {
        "passwordHash": "v2$12$2e19a3b5c7d9e1f3a5b7c9d1e3f5a7b9$9f7f537807afaa724ea301a5808db880872902af024be1bf088dc110e85c8d74",
        "role": "user",
        "email": "esther@tim-mfg.com",
        "updatedAt": "2026-10-24T20:21:30.052Z",
        "twoFactorEnabled": true,
        "id": "usr_esther_005",
        "name": "Esther Timah",
        "createdAt": "2026-10-24T20:21:30.052Z",
        "status": "active",
        "twoFactorSecret": "VXHQ6BX6GX2W6FEOIDSHXPPI6VOICBDK",
        "department": "Management",
        "two_factor_secret": "VXHQ6BX6GX2W6FEOIDSHXPPI6VOICBDK",
        "two_factor_enabled": 1,
        "salt": "2e19a3b5c7d9e1f3a5b7c9d1e3f5a7b9",
        "recovery_codes": [],
        "recoveryCodes": []
    },
    {
        "passwordHash": "v2$12$3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f$096fac3b09eefeb529f87dd5c4c92fbeee39b78f374c641cf91afc19e75cd3f4",
        "twoFactorSecret": "MNATBJD54FT6PHLQCPP7YCNZNOCRK5YN",
        "status": "active",
        "updatedAt": "2026-10-24T20:21:30.794Z",
        "id": "usr_user_004",
        "role": "user",
        "name": "Esther Timah (Standard User)",
        "department": "Marketing",
        "salt": "3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f",
        "email": "esthertimah8@gmail.com",
        "twoFactorEnabled": true,
        "createdAt": "2026-10-24T20:21:30.794Z",
        "two_factor_enabled": 1,
        "two_factor_secret": "MNATBJD54FT6PHLQCPP7YCNZNOCRK5YN",
        "recovery_codes": [],
        "recoveryCodes": []
    },
    {
        "passwordHash": "v2$12$9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c$27aaf1820f0d840a5174857cd14bb1cd4b94f18260c9c45f17db9c39830cd5f2",
        "status": "active",
        "twoFactorSecret": null,
        "updatedAt": "2026-10-24T20:21:30.618Z",
        "department": "IT",
        "twoFactorEnabled": false,
        "id": "usr_it_003",
        "salt": "9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c",
        "createdAt": "2026-10-24T20:21:30.618Z",
        "email": "it@tim-mfg.com",
        "role": "it_manager",
        "name": "David Chen (IT Lead)",
        "two_factor_enabled": 0,
        "two_factor_secret": null,
        "recovery_codes": [],
        "recoveryCodes": []
    },
    {
        "two_factor_secret": "6IKW3HNEKHABS2IE2OWUUKU2ZJIA2ZAA",
        "twoFactorSecret": "6IKW3HNEKHABS2IE2OWUUKU2ZJIA2ZAA",
        "email": "marketing@tim-mfg.com",
        "updatedAt": "2026-10-24T20:21:30.453Z",
        "role": "marketing_admin",
        "two_factor_enabled": 1,
        "id": "usr_mkt_002",
        "salt": "5a8b1c2d3e4f5a6b7c8d9e0f1a2b3c4d",
        "department": "Marketing",
        "createdAt": "2026-10-24T20:21:30.453Z",
        "name": "Sarah Jenkins (Marketing Lead)",
        "status": "active",
        "twoFactorEnabled": true,
        "passwordHash": "v2$12$5a8b1c2d3e4f5a6b7c8d9e0f1a2b3c4d$6b7bdbbfbee95d71702cae0d6edb335ebcb16df2f713432846166c4a28b8623c",
        "recovery_codes": [],
        "recoveryCodes": []
    },
    {
        "role": "user",
        "name": "Michael Kwesi",
        "createdAt": "2026-10-24T20:21:30.970Z",
        "salt": "1a2b3c4d5e6f708192a3b4c5d6e7f809",
        "twoFactorEnabled": false,
        "department": "IT",
        "passwordHash": "v2$12$1a2b3c4d5e6f708192a3b4c5d6e7f809$75a3da1ce9d7066a87b64912d7725eebf1ec4c605fa3829bbdcf8326101d14ca",
        "twoFactorSecret": null,
        "status": "active",
        "updatedAt": "2026-10-24T20:21:30.970Z",
        "email": "michael@tim-mfg.com",
        "id": "usr_user_005",
        "two_factor_enabled": 0,
        "two_factor_secret": null,
        "recovery_codes": [],
        "recoveryCodes": []
    },
    {
        "updatedAt": "2026-10-24T20:38:12.866Z",
        "two_factor_enabled": 1,
        "passwordHash": "v2$12$c2ba50cfcab85a2decff7bd0f84b77de$2107330f25d30f067a1730fa9112dc7fe880596da0e3c77dc3fa299ea22b6c0f",
        "two_factor_secret": "OCTRQY5MCNTWTRRCI5RADYUKISDRLGC5",
        "salt": "c2ba50cfcab85a2decff7bd0f84b77de",
        "twoFactorSecret": "OCTRQY5MCNTWTRRCI5RADYUKISDRLGC5",
        "status": "active",
        "department": "Logistics",
        "twoFactorEnabled": true,
        "name": "Nhyira Ayim",
        "recoveryCodes": [
            "68VS-Z1U5",
            "ANL8-Z8BA",
            "DNWR-U57C",
            "A496-P70T",
            "UDO1-DCTE",
            "AYER-OW8A",
            "FA76-RX5U"
        ],
        "createdAt": "2026-10-24T18:33:17.079Z",
        "email": "nhyirahayim@gmail.com",
        "role": "it_manager",
        "recovery_codes": [
            "68VS-Z1U5",
            "ANL8-Z8BA",
            "DNWR-U57C",
            "A496-P70T",
            "UDO1-DCTE",
            "AYER-OW8A",
            "FA76-RX5U"
        ]
    }
];
    window.DEFAULT_SEED_LOGS = [
    {
        "id": 1,
        "details": "User password accepted. Proceeding to 2FA verification.",
        "created_at": "2026-10-24T21:06:22.037Z",
        "actor": "Timah Esther (Super Admin)",
        "timestamp": "2026-10-24T21:06:22.037Z",
        "action": "LOGIN_CREDENTIALS_ACCEPTED",
        "account": "Timah Esther (Super Admin)"
    },
    {
        "id": 2,
        "action": "USER_REGISTERED_FIRESTORE",
        "actor": "Nhyira Ayim",
        "details": "New account created in Cloud Firestore users collection.",
        "email": "nhyirahayim@gmail.com",
        "timestamp": "2026-10-24T18:33:17.463Z"
    },
    {
        "id": 3,
        "action": "RECOVERY_CODE_CONSUMED",
        "actor": "Nhyira Ayim",
        "timestamp": "2026-10-24T20:30:35.724Z",
        "details": "Consumed single-use emergency recovery code (9 remaining)"
    },
    {
        "id": 4,
        "timestamp": "2026-10-24T06:48:57.758Z",
        "action": "USER_REGISTERED_FIRESTORE",
        "details": "New account created in Cloud Firestore users collection.",
        "actor": "Amos Oware",
        "email": "ayimnhyirahamos@gmail.com"
    },
    {
        "id": 5,
        "created_at": "2026-10-24T20:51:20.707Z",
        "details": "User password accepted. Proceeding to 2FA verification.",
        "timestamp": "2026-10-24T20:51:20.708Z",
        "actor": "Timah Esther (Super Admin)",
        "account": "Timah Esther (Super Admin)",
        "action": "LOGIN_CREDENTIALS_ACCEPTED"
    },
    {
        "id": 6,
        "details": "Verified direct HTTPS connection to Cloud Firestore",
        "actor": "DirectFirestoreClient",
        "timestamp": "2026-10-24T20:47:25.113Z",
        "action": "SYSTEM_DIAGNOSTIC"
    },
    {
        "id": 7,
        "action": "RECOVERY_CODE_CONSUMED",
        "actor": "test@example.com",
        "details": "Consumed single-use emergency recovery code (0 remaining)",
        "timestamp": "2026-10-24T20:33:27.458Z"
    },
    {
        "id": 8,
        "actor": "Timah Esther (Super Admin)",
        "action": "RECOVERY_CODE_CONSUMED",
        "details": "Consumed single-use emergency recovery code (3 remaining)",
        "timestamp": "2026-10-24T20:24:17.181Z"
    },
    {
        "id": 9,
        "account": "admin@example.com",
        "timestamp": "2026-10-24T20:51:43.537Z",
        "action": "LOGIN_FAILED",
        "created_at": "2026-10-24T20:51:43.537Z",
        "actor": "admin@example.com",
        "details": "Failed login attempt (incorrect password)"
    },
    {
        "id": 10,
        "details": "Consumed single-use emergency recovery code (8 remaining)",
        "timestamp": "2026-10-24T20:37:33.574Z",
        "action": "RECOVERY_CODE_CONSUMED",
        "actor": "Nhyira Ayim"
    },
    {
        "id": 11,
        "actor": "Timah Esther (Super Admin)",
        "action": "RECOVERY_CODE_CONSUMED",
        "details": "Consumed single-use emergency recovery code (4 remaining)",
        "timestamp": "2026-10-24T20:24:16.464Z"
    },
    {
        "id": 12,
        "action": "RECOVERY_CODE_CONSUMED",
        "details": "Consumed single-use emergency recovery code (7 remaining)",
        "actor": "Nhyira Ayim",
        "timestamp": "2026-10-24T20:38:13.045Z"
    },
    {
        "id": 13,
        "actor": "Timah Esther (Super Admin)",
        "timestamp": "2026-10-24T20:21:47.517Z",
        "details": "Consumed single-use emergency recovery code (2 remaining)",
        "action": "RECOVERY_CODE_CONSUMED"
    },
    {
        "id": 14,
        "account": "Nhyira Ayim",
        "timestamp": "2026-10-24T20:55:28.509Z",
        "created_at": "2026-10-24T20:55:28.509Z",
        "action": "LOGIN_CREDENTIALS_ACCEPTED",
        "details": "User password accepted. Proceeding to 2FA verification.",
        "actor": "Nhyira Ayim"
    },
    {
        "id": 15,
        "details": "User password accepted. Proceeding to 2FA verification.",
        "actor": "Nhyira Ayim",
        "created_at": "2026-10-24T20:54:35.422Z",
        "action": "LOGIN_CREDENTIALS_ACCEPTED",
        "account": "Nhyira Ayim",
        "timestamp": "2026-10-24T20:54:35.422Z"
    }
];
    window.DEFAULT_SEED_PRODUCTS = [
    {
        "id": 1,
        "name": "Bottled Water (500ml)",
        "category": "Beverages",
        "current_stock": 500,
        "price": 2.5
    },
    {
        "id": 2,
        "name": "Orange Juice (1L)",
        "category": "Beverages",
        "current_stock": 320,
        "price": 8
    },
    {
        "id": 3,
        "name": "Digestive Biscuits",
        "category": "Snacks",
        "current_stock": 350,
        "price": 4.5
    },
    {
        "id": 4,
        "name": "Sanitizing Hand Wipes",
        "category": "Hygiene",
        "current_stock": 220,
        "price": 6
    }
];
    window.DEFAULT_SEED_SALES = [
    {
        "id": 1,
        "product_id": 1,
        "product_name": "Bottled Water (500ml)",
        "product_category": "Beverages",
        "quantity_sold": 1250,
        "current_stock": 500,
        "sale_date": "2026-10-20",
        "deleted_at": null
    },
    {
        "id": 2,
        "product_id": 2,
        "product_name": "Orange Juice (1L)",
        "product_category": "Beverages",
        "quantity_sold": 680,
        "current_stock": 320,
        "sale_date": "2026-10-21",
        "deleted_at": null
    },
    {
        "id": 3,
        "product_id": 3,
        "product_name": "Digestive Biscuits",
        "product_category": "Snacks",
        "quantity_sold": 950,
        "current_stock": 350,
        "sale_date": "2026-10-22",
        "deleted_at": null
    }
];

    console.log("[SeedData] Loaded 12 enterprise users, 15 audit logs, and catalog items for standalone operation.");
})(window);
