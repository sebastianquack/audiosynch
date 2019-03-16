import Service from './Service';

import {sequenceService, nearbyService, soundService, storageService} from './';

class GameService extends Service {

	constructor() {
		// initialize with reactive vars
		super("gameService", {
			gameMode: "manual",			// manual, walk, installation
			activeWalk: null,
			pathIndex: 0,
			walkStatus: "off",			// off -> ongoing -> ended
			challengeStatus: "off",		// off <-> navigate <-> prepare <-> play 
			activeChallenge: null, 		// active challenge saved here
			showInstrumentSelector: false, // show the interface selector in the interface
      statusBarTitle: "Title",
      statusBarSubtitle: "Description",
      debugMode: false          // show debugging info in interface
		});

		// not reactive vars
		this.discoveryTimeout;

		this.assistanceThreshold = 2000;
	}

	toggleDebugMode = ()=> {
		this.setReactive({
			debugMode: !this.state.debugMode
		});
	}

	// called by admin to change game mode - here: to leave walk mode
	setGameMode = (mode)=> {
		if(this.state.gameMode == "walk" && mode == "manual") {
			this.setReactive({
				activeWalk: null,
				pathIndex: 0,
				gameMode: "manual"
			});

			this.leaveChallenge();
		}
	}

	// called when admin starts walk
	setActiveWalk = (walk)=> {
		
		let activePath = storageService.getActivePath(walk);
		
		if(activePath) {

			this.setReactive({
				activeWalk: walk,
				activePath: activePath,
				pathIndex: 0,
				gameMode: "walk"
			});

			this.setupActivePlace();
		}
	}

	// called when user leaves place, moves to next one
	moveToNextPlaceInWalk = ()=> {
		this.setReactive({
			pathIndex: this.state.pathIndex + 1
		});
		this.setupActivePlace();
	}

	setupActivePlace = ()=> {
		// check if there are still places in path
		if(this.state.pathIndex >= this.state.activePath.length) {
			this.showNotification("end of path")
			this.setReactive({
				activePlaceReference: null,
				activePlace: null,
				activeChallenge: null,
				walkStatus: "ended"
			});
			return;
		}

		let placeReference = this.state.activePath[this.state.pathIndex];
		let place = storageService.findPlace(placeReference.place, this.state.activeWalk.tag);
		this.setReactive({
			walkStatus: "ongoing",
			activePlaceReference: placeReference,
			activePlace: place
		});

		let challenge = storageService.findChallenge(place.challenge_id);
		this.setActiveChallenge(challenge);
	}

	// called when user enters a challenge
	setActiveChallenge = (challenge)=> {
		this.setReactive({
			activeChallenge: challenge
		});

    this.setActiveChallengeStatus(this.state.gameMode == "walk" ? "navigate" : "prepare");

		sequenceService.setSequence(challenge.sequence_id);

    this.setReactive({
      statusBarTitle: sequenceService.getSequenceName(),
      statusBarSubtitle: challenge.name
    })

		//start nearby service with challengeId as serviceId - adding timeout to give time for shutdown
		setTimeout(()=>{
			nearbyService.initNearbyWithServiceId(challenge._id);	
		}, 2000);

    this.activateNearbyCallbacks();
	}

  activateNearbyCallbacks() {
    nearbyService.setCustomCallbacks({
      onConnectionEstablished: () => {
        // todo
      },
      onMessageReceived: (message) => {
        
        // if this is start sequence message
        if(message.message == "start_sequence") {

          // if we haven't started and are ready to play
          if(sequenceService.getControlStatus() == "ready")  {
            sequenceService.startSequence(message.startTime, false); // just start sequence, not item started locally
          }
        }
      },
      // todo: onConnectionLost
    });   
  }

	setActiveChallengeStatus = (status)=> {

		this.setReactive({
			challengeStatus: status
		});

    if(status == "prepare") {
      this.activateNearbyCallbacks();
    }
	}

	getActiveChallenge = ()=> {
		return this.state.activeChallenge;
	}

	isChallengeLooping = ()=> {
		let looping = false;
		let activeChallenge = this.getActiveChallenge();
		if(activeChallenge) {
			if(activeChallenge.sequence_loop) {
				looping = true;
			}
		}
		return looping;
	}

  startSequence = () => {
      this.showNotification("starting sequence...");
      
      let nowTime = soundService.getSyncTime();
      let startTime = nowTime + 2000; // set time for sequence to start
      sequenceService.startSequence(startTime, true); // set local start flag to true 

      // send start_sequence message to all players connected via nearby
      nearbyService.broadcastMessage({message: "start_sequence", startTime: startTime}); // broadcast time to all connected devices
  }

  handleMissedCue() {
    if(this.state.activeChallenge.item_manual_mode == "assisted") {
      this.showNotification("too late! skipping sound...");   
      sequenceService.skipNextItem();
    }
  }



  /* interface actions */

	// called from TrackSelector when user selects track
	trackSelect = (sequence, track)=> {
		sequenceService.trackSelect(sequence, track);
    this.setReactive({
      showInstrumentSelector: false
    });
	}

	// manual start of items - also called by gestures -- confusing: investigate & rename
	handlePlayNextItemButton = ()=> {

		// if the sequence isn't running, start the sequence and inform other players
		if(sequenceService.getControlStatus() == "ready") {
			this.startSequence();
		// else, if the sequence is already running
		} else {
			if(sequenceService.getControlStatus() == "playing") {
				
				let now = soundService.getSyncTime();
				// compare with item's official start time
				let officialTime = sequenceService.getNextItemStartTimeAbsolute();
				let difference = now - officialTime;
				
				if(this.state.activeChallenge.item_manual_mode == "assisted") {
					if(difference <= -this.assistanceThreshold) {
						this.showNotification("too early! try again");		
					}
					if(difference > -this.assistanceThreshold && difference <= 0) {
						this.showNotification("good!");		
						sequenceService.scheduleSoundForNextItem(officialTime); 			
					}
					if(difference > 0) {
						this.showNotification("too late! skipping sound...");		
						sequenceService.skipNextItem();
					}
				} else {
					sequenceService.scheduleSoundForNextItem(now); 		
				}		
			}	
		}

		sequenceService.updateActionInterface();
  }

  // confusing - investigate & rename?
  handleSkipButton() {
  	sequenceService.skipNextItem();
  }

  // confusing - investigate & rename?
  handleStopButton() {
   	sequenceService.stopCurrentSound();
  }

  // big right button on game container
  handlePlayButton = ()=> {
    switch(this.state.challengeStatus) {
      case "navigate":
        this.setActiveChallengeStatus("prepare");            
        break;
      case "prepare":
        this.setActiveChallengeStatus("play");            
        break;
      default:
        this.showNotification("no current function");
    }
  }

  // center button for instrument selection
  handleMidButton = ()=> {
    if(this.state.challengeStatus == "prepare" || this.state.challengeStatus == "play") {
      this.setReactive({
        showInstrumentSelector: !this.state.showInstrumentSelector
      });  
    } else {
      this.showNotification("no current function");
    }
  }

  // big left button on game container
  handleBackButton = ()=> {
    switch(this.state.challengeStatus) {
      case "play":
        this.backToLobby();
        break;
      case "prepare":
        this.leaveChallenge();
        break;
      default:
        this.showNotification("no current function");
    }
  }

  backToLobby() {
    sequenceService.cancelItemsAndSounds()
    this.setActiveChallengeStatus("prepare");
  }
  
	leaveChallenge() {
		sequenceService.stopSequence();

		//stop nearby service
		nearbyService.shutdownNearby();

    this.setReactive({
      statusBarTitle: "Title",
      statusBarSubtitle: "Description",
      showInstrumentSelector: false
    })
		
		if(this.state.gameMode == "walk") {
			this.moveToNextPlaceInWalk();
		} else {
			this.setReactive({
				challengeStatus: "list",
				activeChallenge: null
			});	
		}

	}

}

const gameService = new GameService();

export {gameService};