// MQTT Connection Parameters
const MQTT_BROKER = "47161622944946a5b84109affb7c79ce.s1.eu.hivemq.cloud"; 
const MQTT_PORT = 8884; 
const MQTT_USER = "ESP32"; 
const MQTT_PASSWORD = "Anakonda1#"; 
const MQTT_COMMAND_TOPIC = "esp32/rover/command"; // Command topic
const MQTT_STATUS_TOPIC = "esp32/rover/status"; // Status topic
const MQTT_RADAR_TOPIC = "esp32/rover/radar"; // Radar data topic
const MQTT_SELF_DESTRUCT_TOPIC = "esp32/rover/selfdestruct"; // Self-destruct topic

// Create a random client ID for the browser session
const MQTT_CLIENT_ID = "webClient_" + Math.random().toString(16).substr(2, 8);

// --- UI Elements ---
const statusElement = document.getElementById('status');
const forwardBtn = document.getElementById('forwardBtn');
const leftBtn = document.getElementById('leftBtn');
const stopBtn = document.getElementById('stopBtn');
const rightBtn = document.getElementById('rightBtn');
const backwardBtn = document.getElementById('backwardBtn');
const radarOnBtn = document.getElementById('radarOnBtn');
const radarOffBtn = document.getElementById('radarOffBtn');

// Self-destruct elements
const selfDestructBtn = document.getElementById('selfDestructBtn');
const abortBtn = document.getElementById('abortBtn');
const countdownDisplay = document.getElementById('countdownDisplay');

// Radar elements
const radarScan = document.querySelector('.radar-scan');
const radarContainer = document.querySelector('.radar-container');

// Store all control buttons in an array for easier management
const controlButtons = [forwardBtn, leftBtn, stopBtn, rightBtn, backwardBtn];

// State tracking
let currentCommand = "STOP";
let isConnected = false;
let mqttClient = null;
let isRadarEnabled = false;
let radarData = {};
let obstacles = {};
let selfDestructActive = false;
let countdownInterval = null;
let currentCountdown = 10;

// Command constants
const COMMANDS = {
    FORWARD: "FORWARD",
    LEFT: "LEFT",
    STOP: "STOP",
    RIGHT: "RIGHT",
    BACKWARD: "BACKWARD",
    RADAR_ON: "RADAR_ON",
    RADAR_OFF: "RADAR_OFF",
    SELF_DESTRUCT_START: "SELF_DESTRUCT_START",
    SELF_DESTRUCT_ABORT: "SELF_DESTRUCT_ABORT"
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
    
    // Setup radar button events
    setupRadarControls();
    
    // Setup self-destruct button events
    setupSelfDestructControls();
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

function setupRadarControls() {
    radarOnBtn.addEventListener('click', function() {
        sendCommand(COMMANDS.RADAR_ON);
        radarOnBtn.classList.add('pressed');
        radarOffBtn.classList.remove('pressed');
        isRadarEnabled = true;
    });
    
    radarOffBtn.addEventListener('click', function() {
        sendCommand(COMMANDS.RADAR_OFF);
        radarOffBtn.classList.add('pressed');
        radarOnBtn.classList.remove('pressed');
        isRadarEnabled = false;
    });
    
    // Default to radar off
    radarOffBtn.classList.add('pressed');
}

function setupSelfDestructControls() {
    // Self-destruct button event
    selfDestructBtn.addEventListener('click', function() {
        if (!isConnected) return;
        
        if (!selfDestructActive) {
            // Start self-destruct sequence
            startSelfDestruct();
        }
    });
    
    // Abort button event
    abortBtn.addEventListener('click', function() {
        if (!isConnected) return;
        
        if (selfDestructActive) {
            // Abort self-destruct sequence
            abortSelfDestruct();
        }
    });
}

function startSelfDestruct() {
    // Activate UI elements
    selfDestructActive = true;
    selfDestructBtn.classList.add('active');
    countdownDisplay.classList.add('countdown-active');
    
    // Reset and display countdown
    currentCountdown = 10;
    updateCountdownDisplay();
    
    // Send self-destruct command to ESP32
    sendSelfDestructCommand(COMMANDS.SELF_DESTRUCT_START);
    
    // Start countdown timer
    countdownInterval = setInterval(function() {
        currentCountdown--;
        updateCountdownDisplay();
        
        if (currentCountdown <= 0) {
            // Countdown finished
            clearInterval(countdownInterval);
            
            // Reset UI after "explosion"
            setTimeout(function() {
                selfDestructActive = false;
                selfDestructBtn.classList.remove('active');
                countdownDisplay.classList.remove('countdown-active');
                statusElement.textContent = "Self-destruct sequence completed";
            }, 2000);
        }
    }, 1000);
}

function abortSelfDestruct() {
    // Stop countdown
    clearInterval(countdownInterval);
    
    // Reset UI elements
    selfDestructActive = false;
    selfDestructBtn.classList.remove('active');
    countdownDisplay.classList.remove('countdown-active');
    
    // Send abort command to ESP32
    sendSelfDestructCommand(COMMANDS.SELF_DESTRUCT_ABORT);
    
    // Update status
    statusElement.textContent = "Self-destruct sequence aborted";
}

function updateCountdownDisplay() {
    countdownDisplay.textContent = `T-${currentCountdown}`;
}

function sendSelfDestructCommand(command) {
    if (!isConnected) {
        console.error("Cannot send self-destruct command, not connected to MQTT broker.");
        return;
    }

    console.log(`Sending self-destruct command: ${command} to topic ${MQTT_SELF_DESTRUCT_TOPIC}`);
    const message = new Paho.MQTT.Message(command);
    message.destinationName = MQTT_SELF_DESTRUCT_TOPIC;
    message.qos = 1; // Higher QoS for critical commands
    mqttClient.send(message);
    
    // If it's the start command, also send the current countdown value
    if (command === COMMANDS.SELF_DESTRUCT_START) {
        const countdownMsg = new Paho.MQTT.Message(currentCountdown.toString());
        countdownMsg.destinationName = MQTT_SELF_DESTRUCT_TOPIC + "/countdown";
        countdownMsg.qos = 1;
        mqttClient.send(countdownMsg);
    }
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
    
    // Subscribe to radar data topic
    mqttClient.subscribe(MQTT_RADAR_TOPIC);
    console.log(`Subscribed to ${MQTT_RADAR_TOPIC}`);
    
    // Subscribe to self-destruct response topic
    mqttClient.subscribe(MQTT_SELF_DESTRUCT_TOPIC + "/status");
    console.log(`Subscribed to ${MQTT_SELF_DESTRUCT_TOPIC}/status`);

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
        
        // If self-destruct was active, abort it
        if (selfDestructActive) {
            clearInterval(countdownInterval);
            selfDestructActive = false;
            selfDestructBtn.classList.remove('active');
            countdownDisplay.classList.remove('countdown-active');
        }
    }
}

function onMessageArrived(message) {
    console.log(`Message Arrived: Topic=${message.destinationName}, Payload=${message.payloadString}`);

    if (message.destinationName === MQTT_STATUS_TOPIC) {
        statusElement.textContent = `Rover Status: ${message.payloadString}`;

        // Update UI to reflect current status from rover feedback
        updateButtonsFromStatus(message.payloadString);        
        currentCommand = message.payloadString;
        
        // Update radar controls if status contains radar info
        if (message.payloadString === "RADAR_ON") {
            radarOnBtn.classList.add('pressed');
            radarOffBtn.classList.remove('pressed');
            isRadarEnabled = true;
        } else if (message.payloadString === "RADAR_OFF") {
            radarOffBtn.classList.add('pressed');
            radarOnBtn.classList.remove('pressed');
            isRadarEnabled = false;
        }
    } else if (message.destinationName === MQTT_RADAR_TOPIC) {
        // Process radar data
        try {
            const radarData = JSON.parse(message.payloadString);
            updateRadarDisplay(radarData);
        } catch (e) {
            console.error("Error parsing radar data:", e);
        }
    } else if (message.destinationName === MQTT_SELF_DESTRUCT_TOPIC + "/status") {
        // Process self-destruct status updates from ESP32
        const status = message.payloadString;
        
        if (status === "INITIATED") {
            statusElement.textContent = "Self-destruct sequence initiated";
            statusElement.style.color = 'red';
        } else if (status === "ABORTED") {
            statusElement.textContent = "Self-destruct sequence aborted";
            statusElement.style.color = 'green';
            
            // Reset UI if we receive abort confirmation
            if (selfDestructActive) {
                clearInterval(countdownInterval);
                selfDestructActive = false;
                selfDestructBtn.classList.remove('active');
                countdownDisplay.classList.remove('countdown-active');
            }
        } else if (status === "COMPLETED") {
            statusElement.textContent = "Self-destruct sequence completed";
            statusElement.style.color = 'red';
            
            // Reset UI
            clearInterval(countdownInterval);
            selfDestructActive = false;
            selfDestructBtn.classList.remove('active');
            countdownDisplay.classList.remove('countdown-active');
        }
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

// --- Radar Functions ---
function updateRadarDisplay(data) {
    if (!isRadarEnabled) return;
    
    // Update radar scan line position
    const angleInDegrees = data.angle;
    radarScan.style.transform = `rotate(${angleInDegrees}deg)`;
    
    // Calculate position on radar (convert polar to cartesian coordinates)
    // The radar is 300px wide, so we scale the distance to fit within that
    // Map the distance to a maximum of 150px (radius of the radar)
    const maxDistance = 400; // cm - maximum measurable distance from HC-SR04
    const radarRadius = 150; // pixels
    
    // Scale distance to fit within radar
    const scaledDistance = Math.min(data.distance, maxDistance) / maxDistance * radarRadius;
    
    // Convert to radians for calculation
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180;
    
    // Calculate x and y position (relative to center of radar)
    const x = scaledDistance * Math.cos(angleInRadians);
    const y = scaledDistance * Math.sin(angleInRadians);
    
    // Adjust to radar container coordinates (center is at 150,150)
    const centerX = 150;
    const centerY = 150;
    const posX = centerX + x;
    const posY = centerY + y;
    
    // Update or create obstacle marker
    const obstacleKey = `obstacle-${angleInDegrees}`;
    
    // Only display obstacles if distance is valid and less than max range
    if (data.distance > 0 && data.distance < maxDistance) {
        if (!obstacles[obstacleKey]) {
            // Create new obstacle
            const obstacle = document.createElement('div');
            obstacle.className = 'obstacle';
            obstacle.style.left = `${posX}px`;
            obstacle.style.top = `${posY}px`;
            
            // Add some data attributes for later reference
            obstacle.dataset.angle = angleInDegrees;
            obstacle.dataset.distance = data.distance;
            
            radarContainer.appendChild(obstacle);
            obstacles[obstacleKey] = obstacle;
        } else {
            // Update existing obstacle
            obstacles[obstacleKey].style.left = `${posX}px`;
            obstacles[obstacleKey].style.top = `${posY}px`;
            obstacles[obstacleKey].dataset.distance = data.distance;
        }
        
        // Make recent obstacles more prominent
        Object.values(obstacles).forEach(obs => {
            obs.style.opacity = '0.3';
        });
        obstacles[obstacleKey].style.opacity = '1';
        
    } else if (obstacles[obstacleKey]) {
        // Remove obstacle if distance is invalid or too far
        radarContainer.removeChild(obstacles[obstacleKey]);
        delete obstacles[obstacleKey];
    }
    
    // Clean up old obstacles that haven't been updated for a while
    // This is a simple implementation - it only keeps the last 36 angles (every 10 degrees)
    const currentObstacles = Object.keys(obstacles);
    if (currentObstacles.length > 36) {
        // Find the oldest obstacle and remove it
        const oldestKey = currentObstacles[0];
        radarContainer.removeChild(obstacles[oldestKey]);
        delete obstacles[oldestKey];
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
