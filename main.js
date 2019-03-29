const request = require('request-promise-native')
const express = require('express')
const app = express()

const port = process.env.PORT
const my_id = process.env.ID
const TIMEOUT = 2000

var peers = process.env.PEERS.split(',')
var election_timer = null
var heartbeat_timer = null
var heartbeat = 0
var current_term = 0
var voted_for = null

app.get('/id', (req, res) => {
    res.send(JSON.stringify({id: my_id}))
})

app.post('/heartbeat', express.json({type: "*/*"}), (req, res) => {
    var is_ok = false
    var body = req.body

    if (body.term >= current_term && body.heartbeat >= heartbeat) {
        is_ok = true
        setElectionTimer()
        clearHeartbeatTimer()
        heartbeat = body.heartbeat

        if (body.term > current_term) {
            current_term = body.term
            voted_for = null
            console.log(`Converting to follower of ${body.id}`)
        }
    }

    console.log(`Heartbeat: ${heartbeat}`)
    res.send(JSON.stringify({ok: is_ok}))
})

app.post('/request_vote', express.json({type: "*/*"}), (req, res) => {
    var ok = false
    var body = req.body
    console.log(`Vote requested: ${JSON.stringify(body)}`)

    if (body.term >= current_term && body.heartbeat >= heartbeat &&
        (voted_for == null || voted_for == body.id)) {
        console.log(`Vote for: ${body.id}`)
        voted_for = body.id
        ok = true
        setElectionTimer()
    }

    res.send(JSON.stringify({term: current_term, voted: ok}))
})

async function doElection() {
    console.log("doElection")

    next_term = current_term + 1
    voted_for = my_id

    // Candidate votes for itself
    votes_received = 1
    votes_sent = 1

    for (p of peers) {
        try {
            var opts = {
                uri: 'http://' + p + '/request_vote',
                json: true,
                timeout: TIMEOUT,
                body: {id: my_id, term: next_term, heartbeat: heartbeat}
            }

            var result = await request.post(opts)
            console.log(`Sending request to: ${p}`)
            votes_sent++

            if (result.voted) {
                console.log(`Got vote from: ${p}`)
                votes_received++
            } else {

                if (result.term > current_term) {
                    current_term = result.term
                    console.log(`Converting to follower of ${body.term}, newer term`)
                }
                voted_for = null
                clearHeartbeatTimer()
            }
        } catch (err) {
            console.log(`Error when requesting vote: ${err}`)
        }
    }

    var needed = (peers.length + 1) / 2

    if (votes_received >= needed) {
        current_term = next_term
        console.log(`Term ${current_term} starting with leader ${my_id}`)
        heartbeat++
        setHeartbeatTimer()
    } else {
        console.log(`Not enough votes, needed ${needed}, have ${votes_received}`)
    }
}

function startElection() {
    doElection()
        .then(() => setElectionTimer())
}

function setElectionTimer() {
    if (election_timer) {
        clearTimeout(election_timer)
    }
    election_timer = setTimeout(startElection, TIMEOUT * 2 + Math.random() * 1000)
}

function store_result(promise) {
    return promise
        .then((a) => {return a.ok}, (b) => {return false})
}

async function sendHeartbeat() {

    var promises = peers.map(p => request.post({
        uri: 'http://' + p + '/heartbeat',
        json: true,
        timeout: TIMEOUT,
        body: {id: my_id, term: current_term, heartbeat: heartbeat}
    })).map(store_result)

    Promise.all(promises)
    .then((pr) => {
         if (pr.filter(x => x).length > 0) {
             heartbeat++
         } else {
             console.log("Failed to send heartbeat, no recipients")
         }
    })
    .then(() => setHeartbeatTimer())
    .then(() => setElectionTimer())
    .catch((err) => console.log(`Heartbeat failure, this should not happen: ${err}`))
}

function setHeartbeatTimer() {
    heartbeat_timer = setTimeout(sendHeartbeat, TIMEOUT / 2)
}

function clearHeartbeatTimer() {
    if (heartbeat_timer) {
        clearTimeout(heartbeat_timer)
        heartbeat_timer = null
    }
}

async function excludeSelf() {
    for (p of peers) {
        try {
            var opts = {
                uri: 'http://' + p + '/id',
                json: true,
                timeout: TIMEOUT
            }

            var result = await request.get(opts)

            if (result.id == my_id) {
                console.log(`Excluding myself: ${p}`)
                peers.splice(peers.indexOf(p), 1)
                break
            }
        } catch (err) {
            // Ignore errors
        }
    }
}

//
// Main
//

app.listen(port, () => {
    console.log(`[${my_id}] listening on port ${port}`)
    excludeSelf()
        .then(() => setElectionTimer())
})
