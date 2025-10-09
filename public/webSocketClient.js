// import makeClient from 'grage-lib-jl/dist/esm/client.js';
// import esp8266 from 'grage-lib-jl/dist/esm/esp8266.js';
// import util from 'grage-lib-jl/dist/esm/util.js';
import makeClient from './node_modules/grage-lib-jl/dist/esm/client.js'; // front end script (browser) import statement has to be relative path
import esp8266 from './node_modules/grage-lib-jl/dist/esm/esp8266.js';
import util from './node_modules/grage-lib-jl/dist/esm/util.js';

const serverSideDebugMode = new URLSearchParams(window.location.search).get('debug') === 'true';
const debugFlag = location.hostname === "localhost" || location.hostname === "127.0.0.1" || serverSideDebugMode;
console.log("grage.app.index.Window.onload, debugFlag: ", debugFlag);

fetch('/api/session-info')
  .then(r => r.json())
  .then(data => console.log('[wsClient] Session info:', data));

function showDebugMsg(...args) {
    if (debugFlag)
        console.log(...args);
}
window.onload = async function () {
    showDebugMsg("[webSocketClient][webSocketClient], window.onload");

    const grage = makeClient();
    let id;
    try {
        console.log('[win.onload] Fetching user profile data...');
        const res = await fetch('/api/retrieveUserProfile');
        const userDetails = await res.json();
        if (!res.ok) {
            throw new Error(`Retrieve User Profile Error! status: ${res.status}; message: ${userDetails.error}`); // userDetails may contain error details from server
        }
        showDebugMsg('[webSocketClient]Returned JSON object: ', userDetails)
        if (userDetails.error) {
            document.body.innerHTML = '<h1>Server Error</h1><p>An unexpected error occurred. Please try again later.</p>';
            // Optionally, you can log the error to the console
            showDebugMsg('[webSocketClient] Error: user not authenticated', userDetails.error);
            // Note: You cannot set HTTP status code from client-side JavaScript,
            // but you can display an error message/page to the user.
            return;
        } else {
            id = userDetails.DeviceID;            // Although in ID token the field is called userDeviceID but in my JSON response, the field is shorten as DeviceID
            showDebugMsg('[webSocketClient]User details retrieved from /api/retrieveUserProfile: ', id);
        }
    } catch (err) {
        showDebugMsg('[webSocketClient]Fetch /api/retrieveUserProfile error: ', err);
        let errorMessage = '';
        if (debugFlag) { errorMessage = `<h1>Debugflag is true </h1><p>${err.message}</p>`; }  //show error message only when debugFlag is true
        document.body.innerHTML = `
            <h1>Server Error</h1><p>An unexpected error occurred. Please try again later.</p>
            ${errorMessage}
            <button onclick="window.location.href='/'">Back To Homepage</button>
        `;
        return;
    }

    //if no device selected, return to index
    showDebugMsg('[webSocketClient]deviceID: ', id);
    if (!id) {
        showDebugMsg('[webSocketClient]No deviceID retrieved, giving user chance to login again.');
        // show a button to let user go back to login page
        // window.location.href = 'index.html';
        document.body.innerHTML = '<h1>Server Error</h1><p>No deviceID retrieved.</p>';
        return;
    }
    else {
        showDebugMsg('[webSocketClient]grage-door, device id: ', id);
    }
    //esp constants
    const sensorPin = esp8266.Pin.D6, controlPin = esp8266.Pin.D7;
    //initialize ui
    const indicator = document.querySelector('#onIndicator');
    const lastUpdate = document.querySelector('#lastUpdate');
    const toggle = document.querySelector('#toggle');
    let lastUpdateTime;
    setInterval(function showLastUpdate() {
        if (lastUpdateTime)
            lastUpdate.innerText = 'Last update: ' + util.timeDifference(new Date(), lastUpdateTime);
    }, 1000);
    grage.onOpen(() => {
        showDebugMsg("[webSocketClient]connection to server established, id of this session: ", id);
        toggle.disabled = false;
        //"toggle" is the button to open/close the garage door. When there is no valid connection, it shows "not connected" and is disabled.
        grage.connect(id, function dataPacketHandler(data) {
            showDebugMsg("[webSocketClient]grage.connect.dataPacketHandler, incoming data: ", data);
            const sense = data.pinReadings[sensorPin];
            showDebugMsg(`[webSocketClient]data.pinReadings[12]: ${data.pinReadings[sensorPin]}`);
            if (sense === esp8266.LogicLevel.HIGH) {
                indicator.innerText = 'open';
                toggle.innerText = 'Close door';
            }
            else {
                indicator.innerText = 'closed';
                toggle.innerText = 'Open door';
            }
            lastUpdateTime = new Date();
        });
        //when device becomes alive, run initialization stuff
        //such as setting up inputs, outputs and interrupts
        grage.onAlive(id, function alive() {
            showDebugMsg('[webSocketClient]device is alive, id: ', id);
            //enable input then read
            grage.send(id, esp8266.pinMode(sensorPin, esp8266.PinMode.INPUT_PULLUP));
            grage.send(id, esp8266.attachInterrupt(sensorPin, esp8266.InterruptMode.CHANGE));
            //enable output, make sure it is off
            grage.send(id, esp8266.pinMode(controlPin, esp8266.PinMode.OUTPUT));
            grage.send(id, esp8266.digitalWrite(controlPin, esp8266.LogicLevel.LOW));
        });
        //when device becomes dead, disable ui again
        grage.onDead(id, function dead() {
            showDebugMsg('[webSocketClient]device is dead, id: ', id);
            toggle.disabled = true;
            toggle.innerText = 'not connected';
            indicator.innerText = '';
        });
    });
    toggle.onclick = function handleClick() {
        //disable button while door is in process of opening/closing
        toggle.disabled = true;
        setTimeout(() => toggle.disabled = false, 1000);
        //send 100ms pulse to garage door switch
        grage.send(id, esp8266.digitalWrite(controlPin, esp8266.LogicLevel.HIGH));
        setTimeout(() => {
            grage.send(id, esp8266.digitalWrite(controlPin, esp8266.LogicLevel.LOW));
        }, 100);
    };
};
