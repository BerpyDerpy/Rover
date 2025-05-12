  // MQTT Connection Parameters
  const MQTT_BROKER = "47161622944946a5b84109affb7c79ce.s1.eu.hivemq.cloud"; 
  const MQTT_BROKER = "47161622944946a5b84109affb7c79ce.s1.eu.hivemq.cloud"; 
  const MQTT_PORT = 8884; 
  const MQTT_USER = "ESP32"; 
  const MQTT_PASSWORD = "Anakonda1#"; 
  const MQTT_COMMAND_TOPIC = "esp32/rover/command"; // Command topic
  const MQTT_STATUS_TOPIC = "esp32/rover/status"; // Status topic
  const MQTT_SERVO_TOPIC = "esp32/rover/servo"; // Servo control topic
  const MQTT_SENSOR_MODE_TOPIC = "esp32/rover/sensor/mode"; // Sensor mode topic
  const MQTT_DISTANCE_TOPIC = "esp32/rover/sensor/distance"; // Distance measurements topic
  const MQTT_RADAR_CONTROL_TOPIC = "esp32/rover/radar/control"; // Radar control topic
  const MQTT_RADAR_DATA_TOPIC = "esp32/rover/radar/data"; // Radar data topic
  
  // Create a random client ID for the browser session
  const MQTT_CLIENT_ID = "webClient" + Math.random().toString(16).substr(2, 8);
  
  // --- UI Elements ---
  const statusElement = document.getElementById('status');
  const forwardBtn = document.getElementById('forwardBtn');
  const leftBtn = document.getElementById('leftBtn');
  const stopBtn = document.getElementById('stopBtn');
  const rightBtn = document.getElementById('rightBtn');
  const backwardBtn = document.getElementById('backwardBtn');
  const distanceBtn = document.getElementById('distanceBtn');
  const radarBtn = document.getElementById('radarBtn');
  const distanceMode = document.getElementById('distance-mode');
  const radarMode = document.getElementById('radar-mode');
  const servoControl = document.getElementById('servo-control');
  const servoValue = document.getElementById('servo-value');
  const distanceValue = document.getElementById('distance-value');
  const startScanBtn = document.getElementById('start-scan');
  const stopScanBtn = document.getElementById('stop-scan');
  const radarCanvas = document.getElementById('radar-canvas');
  const radarCtx = radarCanvas.getContext('2d');
  
  // Store all control buttons in an array for easier management
  const controlButtons = [forwardBtn, leftBtn, stopBtn, rightBtn, backwardBtn];
  
  // State tracking
  let currentCommand = "STOP";
  let isConnected = false;
  let mqttClient = null;
  let currentMode = "DISTANCE"; // Default mode
  let isScanning = false;
  let lastDistance = 0;
  
  // Command constants
  const COMMANDS = {
    FORWARD: "FORWARD",
    LEFT: "LEFT",
    STOP: "STOP",
    RIGHT: "RIGHT",
    BACKWARD: "BACKWARD"
  };
  
  // Sensor mode constants
  const SENSOR_MODES = {
    DISTANCE: "DISTANCE",
    RADAR: "RADAR"
  };
  
  // Radar scan constants
  const RADAR_COMMANDS = {
    START: "START",
    STOP: "STOP"
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
    setupSensorControls();
    
    // Initialize radar display
    initRadarDisplay();
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
  
  function setupSensorControls() {
    // Mode selection
    distanceBtn.addEventListener('click', function() {
        setMode(SENSOR_MODES.DISTANCE);
    });
    
    radarBtn.addEventListener('click', function() {
        setMode(SENSOR_MODES.RADAR);
    });
  
    // Servo control
    servoControl.addEventListener('input', function() {
        const angle = servoControl.value;
        servoValue.textContent = angle + "°";
        sendServoPosition(angle);
    });
  
    // Radar scan controls
    startScanBtn.addEventListener('click', function() {
        startRadarScan();
    });
    
    stopScanBtn.addEventListener('click', function() {
        stopRadarScan();
    });
  }
  
  function setMode(mode) {
    if (mode === currentMode) return;
    
    currentMode = mode;
    
    // Update UI
    if (mode === SENSOR_MODES.DISTANCE) {
        distanceBtn.classList.add('active');
        radarBtn.classList.remove('active');
        distanceMode.classList.remove('hidden');
        radarMode.classList.add('hidden');
        
        // Stop radar scan if it's running
        if (isScanning) {
            stopRadarScan();
        }
    } else {
        radarBtn.classList.add('active');
        distanceBtn.classList.remove('active');
        radarMode.classList.remove('hidden');
        distanceMode.classList.add('hidden');
        
        // Center servo when entering radar mode
        sendServoPosition(90);
        servoControl.value = 90;
        servoValue.textContent = "90°";
    }
    
    // Send mode change to ESP32
    sendMessage(MQTT_SENSOR_MODE_TOPIC, mode);
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
  
  function sendServoPosition(angle) {
    if (!isConnected) return;
    sendMessage(MQTT_SERVO_TOPIC, angle.toString());
  }
  
  function startRadarScan() {
    if (!isConnected || isScanning) return;
    
    isScanning = true;
    startScanBtn.disabled = true;
    stopScanBtn.disabled = false;
    
    // Clear radar display
    clearRadarDisplay();
    
    // Send start scan command
    sendMessage(MQTT_RADAR_CONTROL_TOPIC, RADAR_COMMANDS.START);
  }
  
  function stopRadarScan() {
    if (!isConnected || !isScanning) return;
    
    isScanning = false;
    startScanBtn.disabled = false;
    stopScanBtn.disabled = true;
    
    // Send stop scan command
    sendMessage(MQTT_RADAR_CONTROL_TOPIC, RADAR_COMMANDS.STOP);
  }
  
  function initRadarDisplay() {
    clearRadarDisplay();
    
    // Draw radar baseline
    radarCtx.strokeStyle = '#0f0';
    radarCtx.beginPath();
    radarCtx.moveTo(150, 200);
    radarCtx.lineTo(150, 180);
    radarCtx.stroke();
    
    // Draw radar arc
    radarCtx.beginPath();
    radarCtx.arc(150, 200, 150, Math.PI, 0, false);
    radarCtx.strokeStyle = '#333';
    radarCtx.stroke();
    
    // Draw distance markers
    radarCtx.strokeStyle = '#333';
    radarCtx.beginPath();
    radarCtx.arc(150, 200, 50, Math.PI, 0, false);
    radarCtx.stroke();
    radarCtx.beginPath();
    radarCtx.arc(150, 200, 100, Math.PI, 0, false);
    radarCtx.stroke();
    
    // Add text for distance markers
    radarCtx.fillStyle = '#777';
    radarCtx.font = '10px Arial';
    radarCtx.fillText('50cm', 150, 145);
    radarCtx.fillText('100cm', 150, 95);
    radarCtx.fillText('150cm', 150, 45);
  }
  
  function clearRadarDisplay() {
    // Clear the canvas
    radarCtx.fillStyle = 'black';
    radarCtx.fillRect(0, 0, radarCanvas.width, radarCanvas.height);
    
    // Redraw baseline elements
    initRadarDisplay();
  }
  
  function updateRadarDisplay(angle, distance) {
    // Convert angle to radians (0 degrees = straight ahead, convert to radar coordinates)
    const radians = (180 - angle) * Math.PI / 180;
    
    // Max detection distance for scaling purposes
    const maxDistance = 200; // cm
    
    // Scale distance to fit on radar (max radius is 150px)
    const scaledDistance = Math.min(distance, maxDistance) / maxDistance * 150;
    
    // Calculate end point
    const endX = 150 + scaledDistance * Math.cos(radians);
    const endY = 200 - scaledDistance * Math.sin(radians);
    
    // Draw radar line
    radarCtx.strokeStyle = '#0f0';
    radarCtx.beginPath();
    radarCtx.moveTo(150, 200);
    radarCtx.lineTo(endX, endY);
    radarCtx.stroke();
    
    // Draw detection point
    if (distance < maxDistance) {
        radarCtx.fillStyle = 'red';
        radarCtx.beginPath();
        radarCtx.arc(endX, endY, 3, 0, 2 * Math.PI);
        radarCtx.fill();
    }
  }
  
  // --- Callback Functions ---
  function onConnect() {
    console.log("Connected to MQTT Broker!");
    statusElement.textContent = "Connected. Ready to control rover.";
    statusElement.style.color = 'green';
    isConnected = true;
  
    // Subscribe to topics
    mqttClient.subscribe(MQTT_STATUS_TOPIC);
    mqttClient.subscribe(MQTT_DISTANCE_TOPIC);
    mqttClient.subscribe(MQTT_RADAR_DATA_TOPIC);
    console.log(`Subscribed to ${MQTT_STATUS_TOPIC}`);
    console.log(`Subscribed to ${MQTT_DISTANCE_TOPIC}`);
    console.log(`Subscribed to ${MQTT_RADAR_DATA_TOPIC}`);
  
    // Send STOP command initially to ensure rover is stationary
    sendCommand(COMMANDS.STOP);
    currentCommand = COMMANDS.STOP;
    stopBtn.classList.add('pressed');
    
    // Set initial mode
    setMode(SENSOR_MODES.DISTANCE);
    
    // Set initial servo position
    sendServoPosition(90);
  }
  
  function onFailure(responseObject) {
    console.error(`MQTT Connection Failed: ${responseObject.errorMessage} (Code: ${responseObject.errorCode})`);
    console.error("Full response object:", responseObject);
  
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
        
        // Stop radar scan if it's running
        if (isScanning) {
            isScanning = false;
            startScanBtn.disabled = false;
            stopScanBtn.disabled = true;
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
    }
    else if (message.destinationName === MQTT_DISTANCE_TOPIC) {
        const distance = parseInt(message.payloadString);
        lastDistance = distance;
        distanceValue.textContent = `${distance} cm`;
    }
    else if (message.destinationName === MQTT_RADAR_DATA_TOPIC) {
        // Parse radar data format - expected format: "angle,distance"
        const parts = message.payloadString.split(',');
        if (parts.length === 2) {
            const angle = parseInt(parts[0]);
            const distance = parseInt(parts[1]);
            updateRadarDisplay(angle, distance);
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
  
  // --- Send MQTT Message Function ---
  function sendCommand(command) {
    sendMessage(MQTT_COMMAND_TOPIC, command);
    
    // Update status text
    statusElement.textContent = `Rover Command: ${command}`;
  
    // Set status color based on command
    if (command === COMMANDS.STOP) {
        statusElement.style.color = '#d32f2f'; // Red for STOP
    } else {
        statusElement.style.color = '#3e8e41'; // Green for movement commands
    }
  }
  
  function sendMessage(topic, message) {
    if (!isConnected) {
        console.error("Cannot send message, not connected to MQTT broker.");
        statusElement.textContent = "Error: Not connected. Please refresh.";
        statusElement.style.color = 'red';
        return;
    }
  
    console.log(`Sending message: ${message} to topic ${topic}`);
    const mqttMessage = new Paho.MQTT.Message(message);
    mqttMessage.destinationName = topic;
    mqttMessage.qos = 0; // Quality of Service (0 = at most once)
    mqttClient.send(mqttMessage);
  }
