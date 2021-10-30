// SPDX-License-Identifier: GPL-3.0-or-later

/*
    FSN Gas Faucet: https://freemoonfaucet.xyz
    Request free FSN gas.
    Restricted to new addresses that have nonce zero and balance zero.
    Usable once daily by the same IP address.
*/

import express from "express" // web framework
import compression from "compression" // makes files smaller, thus app is faster
import Mongoose from "mongoose" // mongodb object modelling tool
import cors from "cors" // allow cross origin resource sharing
import _ from "lodash" // utility functions for javascript
import BigNumber from "bignumber.js" // arbitrary precision arithmetic
import helmet from "helmet" // secure app by setting http headers
import moment from "moment" // date library
import bodyParser from "body-parser" // parse incoming request bodies
import rateLimit from "express-rate-limit" // limit repeated requests to the api
import Web3 from "web3" // interacts with blockchain
import dotenv from "dotenv" // access environmental variables
import Address from "./models/Addresses.mjs" // address model

dotenv.config()
const PROVIDER = process.env.PROVIDER_TESTNET
const COORDINATOR = process.env.COORDINATOR
const DB_KEY = process.env.DB_KEY
const GAS_AMOUNT = new BigNumber(process.env.GAS_AMOUNT)
const GAS_PRICE = new BigNumber(process.env.GAS_PRICE)

const PORT = 3001

const app = express()
const router = express.Router()

router.post("/api/v1/retrieve", (req, res) => {
    const ip = req.headers([ "x-forwarded-for" ]) || req.connection.remoteAddress
    console.log(`IP ADDRESS: ${ ip }`)
})

app.set("trust proxy", 1)
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10 // limit each IP to 10 requests per windowMs
})


// apply to all requests
app.use(router)
app.use(limiter)
// app.use(bodyParser.urlencoded({ extended: false }))
// app.use(bodyParser.json())
app.use(cors())
app.use(helmet())


// Database
Mongoose.connect(
    `mongodb+srv://freemoon-dev:${ DB_KEY }@fsn-addresses.yn8dh.mongodb.net/test`,
    {
        useCreateIndex: true,
        useNewUrlParser: true,
        useUnifiedTopology: true,
    }
)


const connect = async () => {
    const web3 = new Web3(PROVIDER)
    const account = web3.eth.accounts.privateKeyToAccount(COORDINATOR)
    web3.eth.accounts.wallet.add(account)
    return { web3, account }
}


const payoutFSN = async (addr, web3, account) => { 
    const coordinator = account.address
    const SEND_GAS = GAS_AMOUNT.multipliedBy(GAS_PRICE)

    const coordBal = web3.eth.fromWei(await web3.eth.getBalance(coordinator))
    if(coordBal < SEND_GAS) throw new Error(`FSN Gas Faucet funds too low: ${ coordBal }`)

    try {
        const receipt = await web3.eth.sendTransaction({
            from: coordinator,
            to: addr,
            value: SEND_GAS.toString(),
            gas: 40000,
            gasPrice: GAS_PRICE.toString()
        })

        return receipt.transactionHash
    } catch(err) {
        throw new Error(`Sending faucet gas failed: ${ err.message }`)
    }
}


app.post("/api/v1/retrieve", async (req, res) => {
    try {       
        const { web3, account } = await connect()

        // return Bad Request whenever no body was passed
        if (!req.body) return res.sendStatus(400)

        let { walletAddress } = req.body
        walletAddress = walletAddress.toLowerCase()

        // Let's check if the walletAddress is actually valid
        if (!web3.utils.isAddress(walletAddress)) {
            throw new Error("Wallet address does not appear to be valid.")
        }

        // Let's filter out the real ip address from the headers

        // ipAddress -> date (person can only do the faucet once a day)
        const ONE_DAY = moment().subtract(1, "days").toDate()
        
        let ipRecent = await Address.findOne({
            ipAddress,
            lastVisit: { $gte: ONE_DAY },
        }).lean()

        let bal = Number(web3.utils.fromWei(await web3.eth.getBalance(walletAddress)))
        let txCount = await web3.eth.getTransactionCount(walletAddress)

        if(ipRecent) {
            throw new Error(`It appears your IP address has claimed for an address recently.`)
        } else if(txCount !== 0) {
            throw new Error(`Entered address does not appear to be unused.`)
        } else if(bal) {
            throw new Error(`Entered address appears to have a non-zero balance: ${ bal }`)
        }    

        // Let's execute the payout
        // let txHash = await payoutFSN(walletAddress, web3, account)
        console.log(`Sending gas to ${ walletAddress }, ${ txHash }`)

        await Address.updateOne(
            {
                walletAddress,
                ipAddress,
            },
            { walletAddress, ipAddress, lastVisit: new Date() },
            { upsert: true }
        )

        return res.json({
            txHash,
            status: `Success. Gas will be sent to ${ walletAddress } shortly.`,
        })
    } catch(err) {
        console.error(err.message)
        res.status(400).send(err.message)
    }
})


app.listen(PORT, () => {
    console.log(`API Server listening on port ${ PORT }`)
})

