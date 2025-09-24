const WebSocket = require("ws");
const { isChannelMessage, isConnectMessage, isDataMessage } = require("grage-lib-jl/dist/cjs/lib.js");
const { Emailer } = require("./johnMailer.js");
const dotenv = require('dotenv');
if ((!process.env.debug) || (process.env.debug === 'true')) {
    dotenv.config({ path: '.env.mailerConfig' });
}
const lostConnectionIntervals = new Map();
let doorOpenTimeout;
const HOST = process.env.HOST || 'localhost';

let debugMode;
if (HOST === 'localhost') {
  debugMode = true;
}else{
    debugMode = false;

}
function showDebugMsg(...args) {
    if (debugMode)
        console.log(...args);
}
showDebugMsg("[mySocketServer], process.env.DEBUG: ", process.env.DEBUG);

function makeWss(options = {
    connectionTimeout: 60 * 1000,
    ping: 60 * 1000,
    maxIdleTimeAllowed: 30 * 60 * 1000,
    maxDoorOpenAllowed: 10 * 60 * 1000,
}) {
    showDebugMsg("[MySocketServer] running makeWss");
    const channels = {};
    function getSockets(id) {
        if (!channels.hasOwnProperty(id)) {
            channels[id] = [];
            showDebugMsg(`[getSocket function] new channel for ${id} added. Current channel list ${Object.keys(channels)}`, 'color:yellow');
        }
        return channels[id];
    }
    let currentID = 1;
    return function handleConnection(currentWSsession, currentHTTPreq) {
        /**
         * All local variables here are properties the connection(websocket session)
         */
        const clientID = currentID++;
        let deviceID = '';
        let fromDevice;
        const connectedChannels = [];
        let doorOpenChecker;
        let lastCLoseReported;
        let doorOpenAlertCount = 0;
        let lostConnectionAlertCount = 0;
        let readyForNewAlert = true;
        // email parameters
        let emailer;
        const receipiant = process.env.DEFAULT_RECEIPIANT;
        const text = 'garage alert by John Lan';
        //regularly send ping with metadata. Comment out as this is not utilized yet anywhere
        // const metadataTimer = setInterval(function sendMetadata() {
        //     const meta: MetadataMessage = {
        //         type: 'metadata',
        //         connectedChannels,
        //         ...options,
        //     };
        //     currentWSsession.send(JSON.stringify(meta));
        // }, options.ping);
        /**
         * Connects to a channel.
         * Only renews timeout if already connected.
         * @param id the id of the channel to connect to
         */
        function connect(id) {
            showDebugMsg(`%c[connection function] client request connection to channel ${id}`, 'color:yellow');
            //connect to channel
            const sockets = getSockets(id);
            //only add if not already
            if (!sockets.includes(currentWSsession)) {
                sockets.push(currentWSsession);
                connectedChannels.push(id);
            }
        }
        /**
         * Disconnects this client from a channel.
         * Does not throw error if client is not connected to channel.
         * @param id the channel to disconnect from
         */
        function removeFromChannel(id) {
            //remove from list of sockets in channel
            const sockets = getSockets(id);
            const idx = sockets.indexOf(currentWSsession);
            if (idx !== -1)
                sockets.splice(idx, 1);
            if (channels[id].length === 0)
                delete channels[id];
            //remove from list of channels this is connected to
            const idx2 = connectedChannels.indexOf(id);
            if (idx2 !== -1)
                connectedChannels.splice(idx2, 1);
        }
        /**
         * Terminates this websocket connection,
         * and cleans up from all connected channels
         */
        function terminate() {
            showDebugMsg(`%c[terminate function] Terminating ${deviceID}`, 'color: yellow');
            // clean up intervals
            //clearInterval(metadataTimer);
            clearInterval(doorOpenChecker);
            //disconnect websocket if not already
            if (currentWSsession.readyState === WebSocket.CONNECTING || currentWSsession.readyState === WebSocket.OPEN) {
                // currentWSsession.terminate(); // this is Sunny's line. Why terminate instead of close?
                currentWSsession.close();
            }
            //clean up socket entry from channels
            for (const id of connectedChannels) {
                removeFromChannel(id);
                showDebugMsg(`%c[terminate][${deviceID}] remove current socket from channel, current channel list ${Object.keys(channels)}`, 'color: yellow');
            }
            // if the closed session is from device, then set up lost connection handling inteval
            if (fromDevice) {
                showDebugMsg(`%cSetting up idle monitor for ${deviceID}`, 'color:blue');
                lostConnectionIntervals.set(deviceID, setInterval(() => {
                    showDebugMsg("[lostConnectionInterval] DeviceID:", deviceID);
                    if (lostConnectionAlertCount < 3) { // only  send alerts 3 times, first time immediately, 2nd time in 5m, 3rd time in 10m
                        let str;
                        if (lostConnectionAlertCount === 0) {
                            str = 'first';
                        }
                        ;
                        if (lostConnectionAlertCount === 1) {
                            str = 'second';
                        }
                        ;
                        if (lostConnectionAlertCount === 2) {
                            str = 'last';
                        }
                        ;
                        showDebugMsg(`[lostConnectionInterval] deviceID : ${deviceID}, sending ${str} alert`);
                        //sendTwilioMsg(`Your garage controller has been offline for too long. This is your ${str} alert`);
                        const subject = `[Garage] has been offline for too long. This is your ${str} alert`; //must have '[Garage]' in subject in order for gmail to apply label
                        let htmlBody = `
                            <h1>WARNING</h1>
                            <p>Your garage door has been offline for ${Math.round(options.maxIdleTimeAllowed * (lostConnectionAlertCount + 1)) / (60 * 1000)} minutes.</p>
                            <p>Visit <a id="garageUI" href="https://grage.azurewebsites.net/apps/grage-door/">here to check status</>.</p>
                        `;
                        try {
                            emailer.sendEmailTo(receipiant, subject, text, htmlBody);
                        }
                        catch (error) {
                            console.error('[socketServer.makeWss.handleConnection.terminate.setInterval] Exception caught while sending email. Ignore the exception');
                        }
                    }
                    else { // after sending 3 alerts, clear self
                        clearInterval(lostConnectionIntervals.get(deviceID));
                        lostConnectionIntervals.delete(deviceID);
                        showDebugMsg(`[terminate function] 3 alerts sent, removed IdleChecker. Devices that are disconnected but remain on idle monitor: ${[...lostConnectionIntervals.keys()]}`);
                    }
                    lostConnectionAlertCount++;
                }, options.maxIdleTimeAllowed));
            }
        }
        currentWSsession.on('connection', (ws, req) => {
            showDebugMsg('[client connection opened from IP]', req.socket.remoteAddress);
        });
        currentWSsession.on('ping', () => {
            // our "ping" is really a socket "message" that is handled in on.message event
            showDebugMsg(`[onPing] client ${clientID} pinged`);
            currentWSsession.pong();
        });
        currentWSsession.on('close', terminate);
        /**
         * Handles when any user induced error occurs
         * @param error the error which occurred
         */
        function handleError(deviceID, fromDevice, err) {
            //allows this function to be directly used in callbacks
            //where the error is undefined upon success
            if (!err) { // changed from what it was [ if (err == undefined)]. !err checks for both null and undefined. Checking only undefined makes app crash when err is null.
                return;
            }
            console.error(`[client ${clientID} error]`, err);
            //try to tell client what went wrong
            const errMsg = {
                type: "error",
                error: err.stack ? err.stack.toString() : 'No stack trace'
            };
            currentWSsession.send(JSON.stringify(errMsg), (e) => {
                if (e) {
                    //this prints if send failed
                    console.error('Error while sending error', e);
                }
                //terminate connection no matter what
                terminate();
            });
        }
        // Majority of payload messages are handled here. 
        // Most important thing to remember is ws.ts as server doesn't really handle anything, it merely relays messages
        // to all other clients on same channel (same channel is defined by all sockets with same deviceID)
        currentWSsession.on('message', function channelMessageHandler(message) {
            //showDebugMsg(`[on message] socket message received from client ${clientID}, url ${currentWSsession.url}`, message.toString());
            let m;
            try {
                m = JSON.parse(message.toString());
                showDebugMsg("[on message] Recieved socket message: ", message);
            }
            catch (err) {
                showDebugMsg("[on message] Parsing incoming message excpetion", message);
                return; // skip maybe just a temporary corrupted messag
            }
            if (isChannelMessage(m)) {
                //record deviceID
                deviceID = m.id;
                fromDevice = m.fromDevice;
                //send to every client in certain channel (relay)
                for (const client of getSockets(deviceID)) {
                    //skip currentWSsession (person who sent message)
                    if (client !== currentWSsession)
                        client.send(JSON.stringify(m), (err) => {
                            if (err) {
                                showDebugMsg(`%c[onMessage].Failed to relay, HandleError will be called next, which will close socket. Device:${deviceID}`, "color: red");
                                handleError(deviceID, fromDevice, err);
                            }
                        });
                }
                if (fromDevice) { // if this is device socket, add time tracking feature
                    // create a emailer instance for a device socket session
                    if (!emailer) {
                        emailer = new Emailer();
                    }
                    //if a openMonitor not yet exists, create one. This interval should be disposed when socket is closed 
                    // and it is indeed disposed in terminate()
                    if (!doorOpenChecker) { //install monitor only when one doesn't not yet exist
                        lastCLoseReported = new Date(); // Assuming door is closed when the device first connected to channel.
                        // This var is also reset by on.message.data event where pinReadings is closed.
                        showDebugMsg(`%cSetting up open monitor for ${deviceID}`, 'color:blue');
                        doorOpenAlertCount = 0;
                        doorOpenChecker = setInterval(() => {
                            const now = new Date();
                            showDebugMsg(`%c[doorOpenChecker] deviceID: ${deviceID}`, 'color:green');
                            // sends rping message to make sure device sends its status regulary
                            const pokingMsg = {
                                type: "rping",
                                id: deviceID,
                                fromDevice: false
                            };
                            currentWSsession.send(JSON.stringify(pokingMsg), (err) => {
                                if (err) {
                                    showDebugMsg(`%c[doorOpenChecker] Failed to send poking msg, HandleError will be called next, which will close socket`, 'color:red');
                                    handleError(deviceID, false, err);
                                }
                            });
                            // compare times to determin if door has been open too long
                            showDebugMsg(`[doorOpenCheck][${deviceID}] Current Time: ${now.toTimeString().split(' ')[0]}, lastCloseReported ${lastCLoseReported.toTimeString().split(' ')[0]}`);
                            const doorOpenDuration = now.getTime() - lastCLoseReported.getTime();
                            showDebugMsg(`[doorOpenChecker][${deviceID}] Door has been open for ${Math.round(doorOpenDuration / (60 * 1000))} minutes`);
                            if (doorOpenDuration > options.maxDoorOpenAllowed) { //Door open too long
                                if ((doorOpenAlertCount < 3) && (readyForNewAlert)) { // only  send alerts 3 times, first time immediately, 2nd time in 5m, 3rd time in 10m
                                    readyForNewAlert = false;
                                    doorOpenTimeout = setTimeout((count = doorOpenAlertCount) => {
                                        let str;
                                        if (count === 0) {
                                            str = 'first';
                                        }
                                        else if (count === 1) {
                                            str = 'second';
                                        }
                                        else {
                                            str = 'last';
                                        }
                                        showDebugMsg(`[doorOpenChecker][${deviceID}] Sending ${str} open alert`);
                                        //sendTwilioMsg(`Your garage door has been open for too long. This is your ${str} alert`);
                                        const subject = `[Garage] has been open for too long. This is your ${str} alert`; //must have '[Garage]' in subject in order for gmail to apply label
                                        let htmlBody = `
                                                <h1>WARNING</h1>
                                                <p>Your garage door has been open for ${Math.round(doorOpenDuration / (60 * 1000))} minutes.</p>
                                                <p>Visit <a id="garageUI" href="https://grage.azurewebsites.net/apps/grage-door/">here to check status</>.</p>
                                            `;
                                        try {
                                            emailer.sendEmailTo(receipiant, subject, text, htmlBody);
                                        }
                                        catch (error) {
                                            console.error('[socketServer.makeWss.handleConnection.channelMessageHandler.setInterval.setTimeout] Exception caught while sending email. Ignore the exception');
                                        }
                                        readyForNewAlert = true;
                                        doorOpenAlertCount++;
                                    }, doorOpenAlertCount * 5 * 60 * 1000);
                                }
                            }
                            else {
                                doorOpenAlertCount = 0;
                            }
                        }, options.ping);
                    }
                    // if a lostConnectionInterval exists, remove it
                    clearInterval(lostConnectionIntervals.get(deviceID));
                    lostConnectionIntervals.delete(deviceID);
                    showDebugMsg(`[on message][${deviceID}] device is online, removed IdleChecker. Disconnected but still monitored devices: ${[...lostConnectionIntervals.keys()]}`);
                }
                if (fromDevice && isDataMessage(m)) { // update lastOpen time
                    // update lastOpen metrics
                    const pinReadings = m.data.pinReadings;
                    const now = new Date();
                    if (pinReadings[12] === 0x01) { // door open
                        showDebugMsg(`[onMessage][${deviceID}] Door open status received`);
                    } // door open
                    if (pinReadings[12] === 0x00) { // door closed
                        showDebugMsg(`[onMessage][${deviceID}] Door close status received, doorOpenCheck should reset doorOpenDuration in coming cycle1`);
                        lastCLoseReported = now;
                        doorOpenAlertCount = 0;
                        clearTimeout(doorOpenTimeout);
                    } // door closed
                }
            }
            else if (isConnectMessage(m)) { //connectionMessage doesn't have "fromDevice" field otherwise this could have been where we set up monitors
                showDebugMsg("[on message] This is a connect request");
                connect(m.id);
            }
            else {
                //commented out by John. Do we need to call handleError for a message we don't recognize? It's OK to show a error message, but handleError
                // may terminate the connnection too, which we probaly don't want to do.
                //handleError(new Error(`Invalid message type: ${m.type}`));
                showDebugMsg(`[[on message] [unrecognized message type] ${(JSON.stringify(m))}`, clientID); // added John. Instead of terminate the connection, just log the error message.
            } // end of different msg types
        }); // end of on.message function
    }; // end of handle connection
}

module.exports = makeWss;