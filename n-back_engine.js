document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const gridCells = document.querySelectorAll('.grid-cell:not(.center-cell)');
    const gridCellMap = new Map();
    gridCells.forEach(cell => gridCellMap.set(parseInt(cell.dataset.position), cell));

    const startSessionBtn = document.getElementById('start-session-btn');
    const resetSessionBtn = document.getElementById('reset-session-btn');
    const matchBtn = document.getElementById('match-btn');
    const noMatchBtn = document.getElementById('no-match-btn');

    const nLevelDisplay = document.getElementById('n-level');
    const gameCounterDisplay = document.getElementById('game-counter');
    const trialCounterDisplay = document.getElementById('trial-counter');
    const feedbackIndicator = document.getElementById('feedback');
    const notificationArea = document.getElementById('notification-area');
    const gameSummaryDisplay = document.getElementById('game-summary');
    const sessionSummaryDisplay = document.getElementById('session-summary');

    // --- Game Configuration ---
    const STIMULI_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
    const STIMULI_NUMBERS = ['1', '2', '3', '4', '5', '6', '7', '8'];
    const ALL_STIMULI_VALUES = [...STIMULI_LETTERS, ...STIMULI_NUMBERS];
    const ACTIVE_POSITIONS = [1, 2, 3, 4, 6, 7, 8, 9]; // Excludes center (5)
    const TRIALS_PER_GAME = 20;
    const GAMES_PER_SESSION = 10;
    const STIMULUS_DURATION = 1000; // 1 second
    const INTER_TRIAL_INTERVAL = 1500; // 1.5 seconds
    const TRIAL_WINDOW = STIMULUS_DURATION + INTER_TRIAL_INTERVAL; // 2.5 seconds total
    const MATCH_PROBABILITY = 0.25; // Target match frequency (approx 20-25%)
    const PERFORMANCE_WINDOW = 5; // Number of games to check for difficulty adjustment
    const ACCURACY_THRESHOLD_INCREASE = 85; // Increase N if accuracy > this %
    const ACCURACY_THRESHOLD_DECREASE = 65; // Decrease N if accuracy < this %

    // --- Game State ---
    let currentN = 1;
    let currentGame = 0;
    let currentTrial = 0;
    let stimulusHistory = []; // Stores { value, position, trial }
    let sessionScores = []; // Stores accuracy % for each game
    let recentPerformanceScores = []; // Tracks last few game scores for adaptation
    let sessionInProgress = false;
    let trialTimer = null;
    let responseTimer = null;
    let playerRespondedThisTrial = false;
    let isMatchExpected = false;
    let currentStimulus = null; // { value, position }
    let correctResponsesInGame = 0;
    let totalTrialsInGame = 0; // Needed for accurate % calculation

    // --- Core Functions ---

    /** Generates the next stimulus ensuring match probability */
    function generateStimulus() {
        let value, position;
        const potentialMatchExists = stimulusHistory.length >= currentN;
        const forceMatch = potentialMatchExists && Math.random() < MATCH_PROBABILITY;

        if (forceMatch) {
            // Force a match based on the stimulus n-steps ago
            const targetStimulus = stimulusHistory[stimulusHistory.length - currentN];
            value = targetStimulus.value;
            position = targetStimulus.position;
            isMatchExpected = true;
            // console.log(`Trial ${currentTrial+1}: Forcing match with trial ${targetStimulus.trial}`);
        } else {
            // Generate randomly
            value = ALL_STIMULI_VALUES[Math.floor(Math.random() * ALL_STIMULI_VALUES.length)];
            position = ACTIVE_POSITIONS[Math.floor(Math.random() * ACTIVE_POSITIONS.length)];
            isMatchExpected = false; // Assume no match initially

            // Double check if this random generation happens to be a match
            if (potentialMatchExists) {
                 const targetStimulus = stimulusHistory[stimulusHistory.length - currentN];
                 if(targetStimulus.value === value && targetStimulus.position === position) {
                     isMatchExpected = true;
                     // console.log(`Trial ${currentTrial+1}: Accidental match`);
                 }
            }
        }
        // console.log(`Trial ${currentTrial+1}: N=${currentN}, Stimulus: ${value} at ${position}, Expect Match: ${isMatchExpected}`);
        return { value, position };
    }

    /** Updates the visual grid display */
    function renderGrid(stimulus) {
        // Clear previous active cell
        gridCells.forEach(cell => {
            cell.classList.remove('active');
            cell.textContent = '';
        });

        if (stimulus) {
            const cellElement = gridCellMap.get(stimulus.position);
            if (cellElement) {
                cellElement.textContent = stimulus.value;
                cellElement.classList.add('active');
            }
        }
    }

    /** Handles player input (Match or No Match button) */
    function handlePlayerResponse(playerChoseMatch) {
        if (!sessionInProgress || playerRespondedThisTrial || currentTrial === 0) {
            return; // Ignore input if game not running, already responded, or before first trial ends
        }

        clearTimeout(responseTimer); // Player responded, cancel timeout feedback
        playerRespondedThisTrial = true;
        matchBtn.disabled = true; // Disable buttons immediately after response
        noMatchBtn.disabled = true;

        const correct = (playerChoseMatch === isMatchExpected);

        if (correct) {
            correctResponsesInGame++;
            flashFeedback(true);
            // console.log("Correct Response");
        } else {
            flashFeedback(false);
            // console.log("Incorrect Response");
        }
    }

    /** Provides visual feedback for correctness */
    function flashFeedback(isCorrect) {
        feedbackIndicator.classList.remove('correct', 'incorrect'); // Clear previous
        void feedbackIndicator.offsetWidth; // Trigger reflow to restart animation/transition if needed
        feedbackIndicator.classList.add(isCorrect ? 'correct' : 'incorrect');
        // Feedback indicator color will persist until the next trial clears it
    }

    /** Clears feedback indicators */
    function clearFeedback() {
         feedbackIndicator.classList.remove('correct', 'incorrect');
         // Clear cell highlight after stimulus duration
         if (currentStimulus) {
            const cellElement = gridCellMap.get(currentStimulus.position);
            if(cellElement) {
               // Optionally keep text for a bit longer, or clear immediately
               // cellElement.textContent = '';
            }
            // Ensure active class is removed after its display time
             setTimeout(() => {
                 if (cellElement) cellElement.classList.remove('active');
             }, STIMULUS_DURATION); // Match stimulus display time
         }
    }

     /** Runs a single trial */
    function runTrial() {
        if (currentTrial >= TRIALS_PER_GAME) {
            endGame();
            return;
        }

        currentTrial++;
        totalTrialsInGame = currentTrial; // Update total trials processed
        playerRespondedThisTrial = false;
        updateUI();

        // Generate and store stimulus
        currentStimulus = generateStimulus();
        stimulusHistory.push({ ...currentStimulus, trial: currentGame * TRIALS_PER_GAME + currentTrial });

        // Display stimulus
        renderGrid(currentStimulus);
        feedbackIndicator.classList.remove('correct', 'incorrect'); // Clear feedback from previous trial START

        // Enable buttons only after the initial N trials (where matches are impossible)
        if (currentTrial > 0) { // Enable from the very first stimulus presentation
             matchBtn.disabled = false;
             noMatchBtn.disabled = false;
        }

        // Set timer to clear stimulus display after duration
        setTimeout(clearStimulusDisplay, STIMULUS_DURATION);

        // Set timer for the end of the response window
        clearTimeout(responseTimer); // Clear any lingering timer
        responseTimer = setTimeout(() => {
            if (!playerRespondedThisTrial) {
                // Player timed out - check if they should have responded 'No Match'
                if (!isMatchExpected) {
                    // Correctly did nothing (correct rejection)
                    correctResponsesInGame++;
                    // Optionally flash green briefly for implicit correct rejection? Or just count it.
                    // console.log("Correct Rejection (Timeout)");
                } else {
                    // Missed a match
                    flashFeedback(false); // Show incorrect feedback
                    // console.log("Incorrect - Missed Match (Timeout)");
                }
                playerRespondedThisTrial = true; // Mark as processed
            }
             // Proceed to next trial after the full trial window
             // This timeout is now primarily for handling the *end* of the response window logic
        }, TRIAL_WINDOW);

        // Set main timer for the next trial start
        clearTimeout(trialTimer);
        trialTimer = setTimeout(runTrial, TRIAL_WINDOW);
    }

    /** Clears the visual stimulus from the grid */
    function clearStimulusDisplay() {
        if (currentStimulus) {
            const cellElement = gridCellMap.get(currentStimulus.position);
            if (cellElement) {
                // Keep text or clear based on preference. Clearing looks cleaner.
                cellElement.textContent = '';
                cellElement.classList.remove('active');
            }
        }
         // DO NOT clear currentStimulus variable itself here, needed for comparison later if response comes after display ends
    }


    /** Ends the current game */
    function endGame() {
        clearTimeout(trialTimer);
        clearTimeout(responseTimer);
        renderGrid(null); // Clear grid
        matchBtn.disabled = true;
        noMatchBtn.disabled = true;

        const accuracy = totalTrialsInGame > 0 ? Math.round((correctResponsesInGame / totalTrialsInGame) * 100) : 0;
        sessionScores.push(accuracy);
        recentPerformanceScores.push(accuracy);
        // Keep only the last `PERFORMANCE_WINDOW` scores for adaptation check
        if (recentPerformanceScores.length > PERFORMANCE_WINDOW) {
            recentPerformanceScores.shift();
        }

        gameSummaryDisplay.textContent = `Game ${currentGame}: ${accuracy}% correct (${correctResponsesInGame}/${totalTrialsInGame})`;
        gameSummaryDisplay.style.display = 'block';


        // Check for difficulty adjustment
        updateDifficulty();

        if (currentGame >= GAMES_PER_SESSION) {
            endSession();
        } else {
            // Short pause before next game
            showNotification("Next game starting soon...", 2000);
            setTimeout(startGame, 2500);
        }
    }

    /** Checks performance and adjusts N if necessary */
    function updateDifficulty() {
        if (recentPerformanceScores.length < PERFORMANCE_WINDOW) {
             // console.log(`Need ${PERFORMANCE_WINDOW} games for adjustment check, have ${recentPerformanceScores.length}`);
            return; // Not enough data yet
        }

        const averageAccuracy = recentPerformanceScores.reduce((sum, score) => sum + score, 0) / recentPerformanceScores.length;
        // console.log(`Checking difficulty: Last ${PERFORMANCE_WINDOW} games avg accuracy: ${averageAccuracy.toFixed(1)}%`);

        let adjustmentMade = false;
        if (averageAccuracy > ACCURACY_THRESHOLD_INCREASE) {
            currentN++;
            showNotification(`Great job! Moving to N = ${currentN}`, 3000);
            adjustmentMade = true;
        } else if (averageAccuracy < ACCURACY_THRESHOLD_DECREASE && currentN > 1) {
            currentN--;
            showNotification(`Let’s adjust. Moving to N = ${currentN}`, 3000);
            adjustmentMade = true;
        }

        if (adjustmentMade) {
             // console.log("Difficulty adjusted. Resetting performance window.");
            recentPerformanceScores = []; // Reset the performance window after adjustment
            nLevelDisplay.textContent = `N = ${currentN}`;
        }
    }

    /** Starts a new game */
    function startGame() {
        if (!sessionInProgress) return; // Should not happen if called correctly

        currentGame++;
        currentTrial = 0;
        correctResponsesInGame = 0;
        totalTrialsInGame = 0;
        // Keep stimulusHistory, it persists across games unless session resets
        // If history gets too long, consider trimming, but for 10 games it's likely fine
        // stimulusHistory = []; // Decide if history should reset per game or persist

        updateUI();
        gameSummaryDisplay.style.display = 'none'; // Hide previous game summary
        sessionSummaryDisplay.style.display = 'none'; // Hide session summary during game
        clearFeedback();

        // Initial delay before first trial
        showNotification(`Starting Game ${currentGame} (N=${currentN})`, 1500);
        setTimeout(runTrial, 2000);
    }

    /** Starts a new session */
    function startSession() {
        sessionInProgress = true;
        currentN = 1; // Start session at N=1
        currentGame = 0;
        sessionScores = [];
        recentPerformanceScores = [];
        stimulusHistory = []; // Clear history for new session

        startSessionBtn.disabled = true;
        resetSessionBtn.disabled = false;
        sessionSummaryDisplay.style.display = 'none'; // Hide previous report
        showNotification("Session Started! N=1", 2000);

        startGame(); // Start the first game
    }

     /** Resets the session */
    function resetSession() {
        clearTimeout(trialTimer);
        clearTimeout(responseTimer);
        sessionInProgress = false;
        currentN = 1;
        currentGame = 0;
        currentTrial = 0;
        stimulusHistory = [];
        sessionScores = [];
        recentPerformanceScores = [];

        startSessionBtn.disabled = false;
        resetSessionBtn.disabled = true;
        matchBtn.disabled = true;
        noMatchBtn.disabled = true;

        renderGrid(null); // Clear grid
        clearFeedback();
        updateUI(); // Reset counters display
        gameSummaryDisplay.style.display = 'none';
        sessionSummaryDisplay.style.display = 'none';
        showNotification("Session Reset. Start a new session when ready.", 3000);
    }

    /** Ends the session and displays report */
    function endSession() {
        sessionInProgress = false;
        startSessionBtn.disabled = false;
        resetSessionBtn.disabled = true; // Can reset again after session ends if desired
        matchBtn.disabled = true;
        noMatchBtn.disabled = true;

        const averageSessionAccuracy = sessionScores.length > 0
            ? (sessionScores.reduce((sum, score) => sum + score, 0) / sessionScores.length).toFixed(1)
            : 0;

        // Basic Strength/Weakness (Placeholder - Needs more sophisticated analysis for real insights)
        let strength = "Consistent performance.";
        let weakness = "Keep practicing!";
        if (averageSessionAccuracy > 85) strength = "Excellent accuracy!";
        if (averageSessionAccuracy < 65) weakness = "Focus on identifying matches/non-matches consistently.";
        // More detailed analysis would track miss types (missed match, false alarm on non-match), position vs value errors etc.

        sessionSummaryDisplay.innerHTML = `
            <h3>Session Complete!</h3>
            <p>Average Accuracy: ${averageSessionAccuracy}%</p>
            <p>Final N-Level Reached: ${currentN}</p>
            <p>Game Scores: ${sessionScores.join('%, ')}%</p>
            <p><strong>Strength:</strong> ${strength}</p>
            <p><strong>Weakness:</strong> ${weakness}</p>
        `;
        sessionSummaryDisplay.style.display = 'block';
        showNotification("Session Finished! See report below.", 5000);
         // console.log("Session Ended. Final Scores:", sessionScores);
    }


    /** Updates static UI elements */
    function updateUI() {
        nLevelDisplay.textContent = `N = ${currentN}`;
        gameCounterDisplay.textContent = `Game: ${currentGame}/${GAMES_PER_SESSION}`;
        trialCounterDisplay.textContent = `Trial: ${currentTrial}/${TRIALS_PER_GAME}`;
    }

    /** Shows a temporary notification message */
    let notificationTimeout = null;
    function showNotification(message, duration = 3000) {
        notificationArea.textContent = message;
        notificationArea.style.display = 'block';
        clearTimeout(notificationTimeout);
        if (duration > 0) {
            notificationTimeout = setTimeout(() => {
                notificationArea.style.display = 'none';
            }, duration);
        }
    }

    // --- Event Listeners ---
    startSessionBtn.addEventListener('click', startSession);
    resetSessionBtn.addEventListener('click', resetSession);
    matchBtn.addEventListener('click', () => handlePlayerResponse(true));
    noMatchBtn.addEventListener('click', () => handlePlayerResponse(false));

    // --- Initial State ---
    resetSessionBtn.disabled = true; // Can't reset before starting
    updateUI(); // Set initial display values
});
