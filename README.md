## FSN Faucet

To run FSN Faucet on Fusion Testnet, add FSN supplier hot wallet private key to .env file:

```
PRIVATE_KEY=0xaaaaa
DB_PASSWORD=0xbbbbb
```

Make sure port 3001 is open.

Run:

```bash
npm start
```

Users can now request gas, once a day, for new wallets only. Users cannot make more than 1 request per day, from any IP address.

## Request Testnet Gas (2 gwei)

To make a request, in a terminal, run:

```bash
curl --location --request POST 'https://api.freemoon.xyz/api/v1/retrieve' --header 'Content-Type: application/json' --data-raw '{"walletAddress": "0xabcdef"}'
```

Where 0xabcdef gets replaced with the address to be funded.
