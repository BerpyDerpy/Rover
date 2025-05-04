// MQTT Connection Parameters
 const MQTT_BROKER = "47161622944946a5b84109affb7c79ce.s1.eu.hivemq.cloud"; 
 const MQTT_PORT = 8884; 
 const MQTT_USER = "ESP32"; 
 const MQTT_PASSWORD = "Anakonda1#"; 
 const MQTT_COMMAND_TOPIC = "esp32/rover/command"; // Command topic
 const MQTT_STATUS_TOPIC = "esp32/rover/status"; // Status topic
// Create a random client ID for the browser session
const MQTT_CLIENT_ID = "webClient_" + Math.random().toString(16).substr(2, 8);

// --- UI Elements ---
const statusElement = document.getElementById('status');
const forwardBtn = document.getElementById('forwardBtn');
const leftBtn = document.getElementById('leftBtn');
const stopBtn = document.getElementById('stopBtn');
const rightBtn = document.getElementById('rightBtn');
const backwardBtn = document.getElementById('backwardBtn');

// Store all control buttons in an array for easier management
const controlButtons = [forwardBtn, leftBtn, stopBtn, rightBtn, backwardBtn];

// State tracking
let currentCommand = "STOP";
let isConnected = false;
let mqttClient = null;

// Command constants
const COMMANDS = {
    FORWARD: "FORWARD",
    LEFT: "LEFT",
    STOP: "STOP",
    RIGHT: "RIGHT",
    BACKWARD: "BACKWARD"
};

// Wait for the page to fully load before connecting to MQTT
window.onload = function() {
    // --- Create MQTT Client Instance ---
    console.log("Creating MQTT client...");
    mqttClient = new Paho.MQTT.Client(MQTT_BROKER, MQTT_PORT, MQTT_CLIENT_ID);
    
    // --- Set Callback Handlers ---
    mqttClient.onConnectionLost = onConnectionLost;
    mqttClient.onMessageArrived = onMessageArrived;
    
    // --- Connection Options ---
    const connectOptions = {
        timeout: 10,
        useSSL: true,
        userName: MQTT_USER,
        password: MQTT_PASSWORD,
        onSuccess: onConnect,
        onFailure: onFailure,
        cleanSession: true
    };
    
    // --- Connect to MQTT Broker ---
    console.log(`Attempting to connect to MQTT broker ${MQTT_BROKER}:${MQTT_PORT}...`);
    mqttClient.connect(connectOptions);
    
    // Setup button events
    setupButtonEvents();
};

// Setup events for both mouse and touch interfaces with press and release handlers
function setupButtonEvents() {
    // Setup each button with press and release events
    setupButtonEventListeners(forwardBtn, COMMANDS.FORWARD);
    setupButtonEventListeners(leftBtn, COMMANDS.LEFT);
    setupButtonEventListeners(stopBtn, COMMANDS.STOP);
    setupButtonEventListeners(rightBtn, COMMANDS.RIGHT);
    setupButtonEventListeners(backwardBtn, COMMANDS.BACKWARD);
    
    // Add document-level event listeners to handle cases where release happens outside buttons
    document.addEventListener('mouseup', handleReleaseOutside);
    document.addEventListener('touchend', handleReleaseOutside);
    document.addEventListener('touchcancel', handleReleaseOutside);
}

function setupButtonEventListeners(button, command) {
    // Mouse events
    button.addEventListener('mousedown', function(e) {
        e.preventDefault();
        activateButton(command, button);
    });
    
    button.addEventListener('mouseup', function(e) {
        e.preventDefault();
        deactivateButton(button);
    });
    
    button.addEventListener('mouseleave', function(e) {
        // Only deactivate if button was pressed
        if (button.classList.contains('pressed')) {
            // Don't send STOP command yet, as user might still be pressing mouse
            // Just remove the visual pressed state
            button.classList.remove('pressed');
        }
    });
    
    // Touch events for mobile
    button.addEventListener('touchstart', function(e) {
        e.preventDefault(); // Prevent default touch behavior
        activateButton(command, button);
    });
    
    button.addEventListener('touchend', function(e) {
        e.preventDefault();
        deactivateButton(button);
    });
    
    button.addEventListener('touchcancel', function(e) {
        e.preventDefault();
        deactivateButton(button);
    });
}

function activateButton(command, button) {
    if (!isConnected) return;
    
    // Reset all buttons' visual state
    controlButtons.forEach(btn => btn.classList.remove('pressed'));
    
    // Highlight the active button
    button.classList.add('pressed');
    
    // Send the command
    sendCommand(command);
    currentCommand = command;
}

function deactivateButton(button) {
    if (!isConnected) return;
    
    // Only send STOP if this was the active button
    if (button.classList.contains('pressed')) {
        button.classList.remove('pressed');
        stopBtn.classList.add('pressed');
        
        // Send STOP command
        sendCommand(COMMANDS.STOP);
        currentCommand = COMMANDS.STOP;
    }
}

// Handle case where user releases mouse/touch outside any button
function handleReleaseOutside(e) {
    // If any button is currently pressed, stop the rover
    let wasButtonPressed = controlButtons.some(btn => 
        btn !== stopBtn && btn.classList.contains('pressed'));
    
    if (wasButtonPressed) {
        // Reset all buttons
        controlButtons.forEach(btn => btn.classList.remove('pressed'));
        stopBtn.classList.add('pressed');
        
        // Send STOP command
        sendCommand(COMMANDS.STOP);
        currentCommand = COMMANDS.STOP;
    }
}

// --- Callback Functions ---
function onConnect() {
    console.log("Connected to MQTT Broker!");
    statusElement.textContent = "Connected. Ready to control rover.";
    statusElement.style.color = 'green';
    isConnected = true;
    
    // Subscribe to status topic for feedback
    mqttClient.subscribe(MQTT_STATUS_TOPIC);
    console.log(`Subscribed to ${MQTT_STATUS_TOPIC}`);
    
    // Send STOP command initially to ensure rover is stationary
    sendCommand(COMMANDS.STOP);
    currentCommand = COMMANDS.STOP;
    stopBtn.classList.add('pressed');
}

function onFailure(responseObject) {
    console.error(`MQTT Connection Failed: ${responseObject.errorMessage} (Code: ${responseObject.errorCode})`);
    console.error(`Full response object:`, responseObject);
    
    // Provide more specific feedback to the user
    let errorMsg = `Connection Failed: ${responseObject.errorMessage}`;
    
    // Add troubleshooting advice based on error
    if (responseObject.errorMessage && responseObject.errorMessage.includes("AMQJS0007E")) {
        errorMsg += ". This may be due to an incorrect WebSocket URL. Make sure you're using 'wss://' prefix and correct port.";
    }
    
    statusElement.textContent = errorMsg;
    statusElement.style.color = 'red';
    isConnected = false;
}

function onConnectionLost(responseObject) {
    if (responseObject.errorCode !== 0) {
        console.error(`MQTT Connection Lost: ${responseObject.errorMessage}`);
        statusElement.textContent = `Connection Lost: ${responseObject.errorMessage}. Please refresh.`;
        statusElement.style.color = 'red';
        isConnected = false;
        
        // Reset all buttons
        controlButtons.forEach(btn => btn.classList.remove('pressed'));
    }
}

function onMessageArrived(message) {
    console.log(`Message Arrived: Topic=${message.destinationName}, Payload=${message.payloadString}`);
    
    if (message.destinationName === MQTT_STATUS_TOPIC) {
        statusElement.textContent = `Rover Status: ${message.payloadString}`;
        
        // Update UI to reflect current status from rover feedback
        updateButtonsFromStatus(message.payloadString);        
        currentCommand = message.payloadString;
    }
}

function updateButtonsFromStatus(status) {
    // Reset all buttons
    controlButtons.forEach(btn => btn.classList.remove('pressed'));
    
    // Highlight the current active button based on status
    switch(status) {
        case COMMANDS.FORWARD:
            forwardBtn.classList.add('pressed');
            break;
        case COMMANDS.LEFT:
            leftBtn.classList.add('pressed');
            break;
        case COMMANDS.STOP:
            stopBtn.classList.add('pressed');
            break;
        case COMMANDS.RIGHT:
            rightBtn.classList.add('pressed');
            break;
        case COMMANDS.BACKWARD:
            backwardBtn.classList.add('pressed');
            break;
    }
}

// --- Send MQTT Message Function ---
function sendCommand(command) {
    if (!isConnected) {
        console.error("Cannot send command, not connected to MQTT broker.");
        statusElement.textContent = "Error: Not connected. Please refresh.";
        statusElement.style.color = 'red';
        return;
    }
    
    console.log(`Sending command: ${command} to topic ${MQTT_COMMAND_TOPIC}`);
    const message = new Paho.MQTT.Message(command);
    message.destinationName = MQTT_COMMAND_TOPIC;
    message.qos = 0; // Quality of Service (0 = at most once)
    mqttClient.send(message);
    
    statusElement.textContent = `Rover Command: ${command}`;
    
    // Set status color based on command
    if (command === COMMANDS.STOP) {
        statusElement.style.color = '#d32f2f'; // Red for STOP
    } else {
        statusElement.style.color = '#3e8e41'; // Green for movement commands
    }
}
