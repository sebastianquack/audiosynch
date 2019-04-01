import Service from './Service';

import {sequenceService, soundService, storageService, relayService, peakService} from './';

import loadNavigationAssets from '../../config/instruments'
const instruments = loadNavigationAssets();

const defaultStatusBarTitle = "Unboxing Mozart";
const defaultStatusBarSubtitle = "Development Version - Testing"

class GameService extends Service {

	constructor() {
		// initialize with reactive vars
		super("gameService", {
			gameMode: "manual",			// manual, walk, installation
			activeWalk: null,
			pathIndex: 0,
			walkStatus: "off",			// off -> tutorial-intro -> ongoing -> ended
      challengeStatus: "off",		// off <-> navigate -> (tutorial->) prepare <-> play 
			activeChallenge: null, 		// active challenge saved here
			tutorialStatus: "off",     // off -> step-1 -> complete
      showInstrumentSelector: false, // show the interface selector in the interface
      statusBarTitle: defaultStatusBarTitle,
      statusBarSubtitle: defaultStatusBarSubtitle,
      debugMode: false,          // show debugging info in interface
      infoStream: [],
      numChallengeParticipants: 1 // number of people in the challenge
		});

		// not reactive vars
		this.discoveryTimeout;

		this.assistanceThreshold = 2000;
    this.guitarHeroThreshold = {pre: 2000, post: 2000}
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
				gameMode: "manual",
        walkStatus: "off"
			});

			this.leaveChallenge();
		}
	}

  /** game mode management **/

	// for navigation testing
  setupMinimalWalk(place) {
    
    this.setReactive({
        activeWalk: {tag: place.tag},
        activePath: {places: [{place: place.shorthand, time: 0}]},
        pathIndex: 0,
        gameMode: "walk"
      });
    this.setupActivePlace();
  }

  // sets up a minimal walk with tutorial feature for testing
  setupTutorialWalk() {
    let place1 = storageService.getPlaceAtIndex(0);
    let place2 = storageService.getPlaceAtIndex(1);
    this.setReactive({
        activeWalk: {tag: place1.tag, tutorial: true},
        activePath: {
          places: [{place: place1.shorthand, time: 0}, {place: place1.shorthand, time: 0}],
          startInstrument: "piano"
        },
        pathLength: 2,
        pathIndex: -1,
        gameMode: "walk",
        walkStatus: "tutorial-intro",
        challengeStatus: "off"
    });
    this.initInfoStream();
  }

  // called when admin starts walk
	setActiveWalk = (walk)=> {
		
		let activePath = storageService.getActivePath(walk);
		
		if(activePath) {

			this.setReactive({
				activeWalk: walk,
        activePath: activePath,
        pathLength: activePath.places.length,
				pathIndex: walk.tutorial ? -1 : 0,
				gameMode: "walk",
        walkStatus: walk.tutorial ? "tutorial-intro" : "ongoing",
        challengeStatus: "off"
			});

      if(walk.tutorial) {
        this.initInfoStream();
      } else {
        this.setupActivePlace();  
      }
		}
	}


  /** walks and places **/

	// called when user leaves place, moves to next one
	moveToNextPlaceInWalk = ()=> {
		this.setReactive({
			pathIndex: this.state.pathIndex + 1
		});
		this.setupActivePlace();
	}

	setupActivePlace = ()=> {
		// check if there are still places in path
		if(this.state.pathIndex >= this.state.activePath.places.length) {
			this.setReactive({
				activePlaceReference: null,
				activePlace: null,
				activeChallenge: null,
				walkStatus: "ended",
        challengeStatus: "off"
			});
      this.initInfoStream();
			return;
		}

		let placeReference = this.state.activePath.places[this.state.pathIndex];
		let place = storageService.findPlace(placeReference.place, this.state.activeWalk.tag);
		this.setReactive({
			walkStatus: "ongoing",
			activePlaceReference: placeReference,
			activePlace: place
		});

		let challenge = storageService.findChallenge(place.challenge_id);
		this.setActiveChallenge(challenge);
	}

  firstPlaceInTutorial = ()=> {
    if(!this.state.activeWalk) return false;
    return (this.state.activeWalk.tutorial && this.state.pathIndex == 0);
  }

  /** challenges **/

	// called when user enters a challenge
	setActiveChallenge = (challenge)=> {
		this.setReactive({
			activeChallenge: challenge
		});

    this.setReactive({challengeStatus: this.state.gameMode == "walk" ? "navigate" : "prepare"});

		sequenceService.setSequence(challenge.sequence_id);

    this.setReactive({
      statusBarTitle: sequenceService.getSequenceName(),
      statusBarSubtitle: challenge.name
    })
    
    relayService.emitMessage({code: "joinChallenge", challengeId: challenge._id, deviceId: storageService.getDeviceId()});
    this.activateRelayCallbacks();
	}

  leaveChallenge() {

    
    relayService.emitMessage({code: "leaveChallenge", challengeId: this.state.activeChallenge ? this.state.activeChallenge._id : null, deviceId: storageService.getDeviceId()});  
    
    sequenceService.stopSequence();

    this.setReactive({
      statusBarTitle: defaultStatusBarTitle,
      statusBarSubtitle: defaultStatusBarSubtitle,
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

    this.initInfoStream();

  }

  onMessageReceived = (msgObj) => {
    //this.showNotification(JSON.stringify(msgObj));

    if(msgObj.code == "challengeParticipantUpdate") {
      if(this.state.activeChallenge) {
        if(msgObj.challengeId == this.state.activeChallenge._id) {
          this.setReactive({numChallengeParticipants: msgObj.numParticipants})
        }  
      }
    }
        
    // if this is start sequence message
    if(msgObj.code == "startSequence") {
      if(this.state.activeChallenge) {
        if(msgObj.challengeId == this.state.activeChallenge._id) {
          this.startSequenceRemotely(msgObj.startTime)  
        }  
      }
    }
  }

  activateNearbyCallbacks = () => {
    nearbyService.setCustomCallbacks({
      onConnectionEstablished: () => {
        // todo
      },
      onMessageReceived: this.onMessageReceived
    });   
  }

  activateRelayCallbacks() {
    relayService.listenForMessages(this.onMessageReceived);
  }

	setActiveChallengeStatus = (status)=> {
		this.setReactive({challengeStatus: status});
	}

	getActiveChallenge = ()=> {
		return this.state.activeChallenge;
	}

  getChallengeStatus = ()=> {
    return this.state.challengeStatus;
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

  getGuitarHeroThreshold = () => {
    return this.guitarHeroThreshold
  }
 

  /** sequences **/

  // called from TrackSelector when user selects track
  trackSelect = (track)=> {
    sequenceService.trackSelect(track);
  }

  startSequence = () => {

      if(this.state.challengeStatus == "play") {
        this.showNotification("starting sequence...");
        
        let nowTime = soundService.getSyncTime();
        let startTime = nowTime + 2000; // set time for sequence to start
        sequenceService.startSequence(startTime, true); // set local start flag to true 

        // send start_sequence message to all players connected via nearby
        relayService.emitMessage({code: "startSequence", challengeId: this.state.activeChallenge._id, startTime: startTime});  
      }
  }

  startSequenceRemotely = startAt => {
    let nowTime = soundService.getSyncTime();
    const startTime = startAt || (nowTime - 1000)

    // should this request restart the sequence?
    // yes, if sequence has already started and the remote time is an earlier time
    if (
        sequenceService.state.controlStatus === "playing"
        // && sequenceService.state.playbackStartedAt > nowTime
        && startTime < sequenceService.state.playbackStartedAt
      ) {
      console.log("startSequenceRemotely: shifting timing")
      sequenceService.shiftSequenceToNewStartTime(startTime);
    }
    // should this request start the sequence?
    // yes, if sequence is ready to play
    else if (sequenceService.state.controlStatus === "ready") {
      console.log("startSequenceRemotely: starting sequence")
      sequenceService.startSequence(startTime, false)
    } else {
      console.log("startSequenceRemotely: ignored, time diff:", startTime, sequenceService.state.playbackStartedAt)
    }
    return null
  }

  handleMissedCue() {
    if(this.state.activeChallenge.item_manual_mode == "assisted") {
      this.showNotification("too late! skipping sound...");   
      sequenceService.skipNextItem();
    }
  }

  handleMissedGuitarHeroCue() {
    this.showNotification("guitar hero too late!");
    console.log("guitar hero missed cue");
    sequenceService.stopCurrentSound();
  }

	// manual start of items - also called by gestures
	handlePlayNextItem = ()=> {

		// if the sequence isn't running, start the sequence and inform other players
		if(sequenceService.getControlStatus() == "ready") {
			this.startSequence();
		// else, if the sequence is already running
		} else {
			if(sequenceService.getControlStatus() == "playing") {
				
				let now = soundService.getSyncTime();
				
        // compare with next item's official start time
        let officialTime = sequenceService.getNextItemStartTimeAbsolute();

        if(this.state.activeChallenge.item_manual_mode == "guitar hero") {
          officialTime = sequenceService.guitarHeroStartTimeAbsolute();
        }  
        
        let difference = now - officialTime;
				
        console.log("handlePlayNextItem with difference: " + difference);
        console.log(sequenceService.state.currentItem);

        if(this.state.activeChallenge.item_manual_mode == "guitar hero") {
            if(difference <= -this.guitarHeroThreshold.pre) {
              this.showNotification("guitar hero: too early!");    
            }
            if(difference > -this.guitarHeroThreshold.pre && difference <= this.guitarHeroThreshold.post) {
              this.showNotification("guitar hero: good!");   
              sequenceService.approveScheduledOrCurrentItem();
            }
        } else {
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
		}

		sequenceService.updateActionInterface();
  }

  handleSkipItem() {
  	sequenceService.skipNextItem();
  }

  // confusing - investigate & rename?
  handleStopItem() {
   	sequenceService.stopCurrentSound();
  }

  backToLobby() {
    sequenceService.cancelItemsAndSounds()
    this.setReactive({challengeStatus :"prepare"});
    this.initInfoStream();
  }
  




  /** interface actions **/

  // big left button on game container
  handleLeftButton = ()=> {
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

  // center button to close instrument selection modal
  handleCloseModal = ()=> {
    this.setReactive({
      showInstrumentSelector: false
    });
    this.handleRightButton();
  }

  // big right button on game container
  handleRightButton = ()=> {
    if(this.state.walkStatus == "tutorial-intro") {
      this.moveToNextPlaceInWalk();
      this.initInfoStream();
      return;
    }

    // decide what to do depending on our current challengeStatus
    switch(this.state.challengeStatus) {
      case "navigate":
        let timeForTutorial = this.state.activeWalk.tutorial && this.state.pathIndex == 0;
        this.setReactive({
          challengeStatus: timeForTutorial ? "tutorial" : "prepare",
          tutorialStatus: timeForTutorial ? "step-1" : "off"
        });            
        this.initInfoStream();
        break;
      case "tutorial":
        this.setReactive({challengeStatus: "prepare"});
        this.initInfoStream();
        if(this.state.tutorialStatus == "complete") {
          sequenceService.trackSelectByName(this.state.activePath.startInstrument);
        }
        break;
      case "prepare":
        this.setReactive({
          challengeStatus: "play",
          tutorialStatus: "first-play"
        });
        sequenceService.resetTrack();
        this.activateRelayCallbacks();
        this.initInfoStream();
        break;
      default:
        //this.showNotification("no current function");
    }
  }

  // info stream management
  clearInfoStream = ()=> {
    this.setReactive({
      infoStream: []
    });
  }

  addItemToInfoStream = (title, content, video=false) => {
    let infoStream = this.state.infoStream;
    infoStream.push({title: title, content: content, video: video});
    this.setReactive({
      infoStream: infoStream
    });
  }

  initInfoStream = ()=> {
    this.clearInfoStream();    
    
    // spcial case - intro before beginning of tutorial walk
    if(this.state.walkStatus == "tutorial-intro") {
      this.addItemToInfoStream(storageService.t("welcome"), storageService.t("tutorial-intro-1"));
    }

    // there is an active challenge
    switch(this.state.challengeStatus) {
      case "navigate":
        this.addItemToInfoStream("navigation", "go to the place marked on the map.");
        this.addItemToInfoStream("navigation", "press check in when you're there!");
        break;
      case "tutorial": 
        this.updateTutorial();
        break
      case "prepare":
        if(this.firstPlaceInTutorial()) {
          this.addItemToInfoStream("welcome", "welcome to this passage. press play to start playing!");
          if(this.state.tutorialStatus == "first-play") {
            this.addItemToInfoStream("did you know?", "you will find vidoes about each passage", true);
          }
        } else {
          this.addItemToInfoStream("welcome", "welcome to this passage. here's a video about it! (placeholder)", true);
          if(!sequenceService.getCurrentTrackName()) {
            this.addItemToInfoStream("how to play", "select your instrument, then press play to start playing");   
          } else {
            this.addItemToInfoStream("how to play", "press play to start playing!");   
          }  
        }
        break;
      case "play":
        sequenceService.updateActionInterface();
        break;
    }

    // special case - end of walk - todo: add before walk here?
    if(this.state.walkStatus == "ended") {
      this.addItemToInfoStream("navigation", "you are at the end of your path. please give back the device"); 
    }
  
  }

  updateTutorial = ()=> {
    switch(this.state.tutorialStatus) {
      case "step-1":
        this.addItemToInfoStream(storageService.t("tutorial"), storageService.t("tutorial-instructions-1"));  
        this.preloadPracticeSound();
        this.activatePeakTutorial(()=>{
          this.playPracticeSound(storageService.t("tutorial-instructions-playing-1"), "step-2");
        });
        break;
      case "step-2":
        this.addItemToInfoStream(storageService.t("tutorial"), storageService.t("tutorial-instructions-2"));  
        this.activatePeakTutorial(()=>{
          this.playPracticeSound(storageService.t("tutorial-instructions-playing-2"), "complete");
        });
        break;
      case "complete":
        this.addItemToInfoStream(storageService.t("tutorial"), storageService.t("tutorial-complete"));
        break;  
    }
  }

  getPracticeSoundFile = () => {
    return instruments[this.state.activePath.startInstrument].practiceSoundPath; 
  }

  preloadPracticeSound = () => {
    soundService.preloadSoundfiles([this.getPracticeSoundFile()], ()=>{
      //console.warn("practice sound loaded");
    }); 
  }

  playPracticeSound = (playInstructions, endStatus) => {
    let soundFile = instruments[this.state.activePath.startInstrument].practiceSoundPath
    soundService.scheduleSound(this.getPracticeSoundFile(), soundService.getSyncTime(), {
      onPlayStart: ()=>{
        this.addItemToInfoStream(storageService.t("tutorial"), playInstructions);
      },
      onPlayEnd: ()=>{
        this.setReactive({tutorialStatus: endStatus});
        this.updateTutorial();
      }
    });
  }

  activatePeakTutorial = (callback)=> {
    peakService.waitForStart(() => {
        peakService.stopWaitingForStart()
        callback();
    });  
  }



}

const gameService = new GameService();

export {gameService};