import Service from './Service';

import {soundService, gameService, gestureService, peakService, storageService } from './';

class SequenceService extends Service {

	constructor() {

		// reactive vars - used in interface component
		super("sequenceService", {
			controlStatus: "idle", // idle -> playing
      loadingStatus: "idle", // idle <-> loading
			currentSequence: null, // sequence object
      currentTrack: null, // track object
			playbackStartedAt: null, // start time of first loop of this sequence
			loopStartedAt: null, // absolute start time of current sequence (in each loop)
			nextItem: null, // next item to play, if available
			scheduledItem: null, // item scheduled for play
			currentItem: null, // current item playing, if available
			showPlayItemButton: false, // should play button be shown
			beatTickActive: false, // should beat be played on the beat
			nextUserAction: {}, // information about the next user action such as gesture start/end time
			isLooping: null,
			loopCounter: 0,
			sequenceTimeVisualizer: 0,
			endedFlag: false // set to true when sequence ended
		});

		// not reactive - used for internal calculations
		this.localStart = false;
		this.beatTimeout = null;

    // use this to save info about the items - is copied from scheduledItemInfo to currentItemInfo on playback begin
    this.scheduledItemInfo = {};
    this.currentItemInfo = {};

		// bind
		this.activateNextUserAction = this.activateNextUserAction.bind(this)
		this.deactivateUserAction = this.deactivateUserAction.bind(this)
		this.startSequence = this.startSequence.bind(this)
		this.stopSequence = this.stopSequence.bind(this)
		this.resetSequence = this.resetSequence.bind(this)
	}



	/** HELPER FUNCTIONS **/

	getControlStatus = ()=> {
		return this.state.controlStatus;
	}

  getSequenceName = ()=> {
    if(this.state.currentSequence) {
      return this.state.currentSequence.name;
    }
    return null;
  }

  getCurrentTrackName = ()=> {
    return this.state.currentTrack ? this.state.currentTrack.name : null;
  }

	// return the first item of a specified track in the current Sequence
	firstItemInTrack = (track)=> {
		let items = this.state.currentSequence.items;
		for(let i = 0; i < items.length; i++) {
			if(items[i].track == track) {
				return items[i];
			}
		}
		return null	
	}

	getNextItemStartTimeAbsolute = ()=> {
		return this.getStartTimeAbsolute(this.state.nextItem);
	}

  guitarHeroStartTimeAbsolute = ()=> {
    if(this.state.currentItem) {
      console.log("using currentItemInfo");
      return this.currentItemInfo.realStartTime;   
    } 
    if(this.state.scheduledItem) {
      console.log("using scheduledItem");
      return this.getStartTimeAbsolute(this.state.scheduledItem);   
    }
  } 

	getStartTimeAbsolute = (item)=> {
		if (!item) return
		const startTime = this.state.loopStartedAt + item.startTime;
		return startTime;	
	}

	sequenceStartingLocally = ()=> {
		//console.log("sequenceStartingLocally", this.localStart, this.state.loopCounter)
		return this.localStart && this.state.loopCounter == 0 && (this.state.playbackStartedAt > soundService.getSyncTime());
	}

	// check if next item should be autoplayed
	autoPlayNextItem = ()=> {
		return(this.autoPlayItem(this.state.nextItem));
	}

	autoPlayItem = (item) => {
		if(!item) return false;

		if(item.autoplay == "off") {
			return false;
		}

		if(item.autoplay == "first" && this.state.loopCounter == 0) {
			return true;
		}

		if(item.autoplay == "on") {
			return true;
		}

		// we shouldn't reach this point
		return false;	
	}

  isGuitarHeroMode() {
    let c = gameService.getActiveChallenge()
    return c.item_manual_mode == "guitar hero";
  }




	/** UPDATES ON EVERY BEAT **/


	toggleBeatTick = ()=> {
		this.setReactive({beatTickActive: !this.state.beatTickActive});
	}

	doBeatUpdate = ()=> {
		
		// calculate time to next item
		const currentTime = soundService.getSyncTime();
    const currentTimeInSequence = currentTime - this.state.loopStartedAt;

		this.setReactive({sequenceTimeVisualizer: 
        currentTimeInSequence >= 0 || this.state.loopCounter == 0 ? currentTimeInSequence : 
        currentTimeInSequence + this.state.currentSequence.custom_duration
    });      
    
		//console.log("beat update - currentTimeInSequence", currentTimeInSequence);
		// check if sequence should end
		if (!this.state.isLooping) {
			const sequenceEndsAt = this.state.playbackStartedAt + this.state.currentSequence.custom_duration
			if (currentTime >= sequenceEndsAt) {
				//console.warn("playbackStartedAt", this.state.playbackStartedAt);
        this.resetSequence();
        this.resetTrack();
        this.updateActionInterface(); 
        gameService.incrementChallengeStage();
        gameService.backToLobby();
        //console.warn(currentTime + " >= " + sequenceEndsAt); 
        return
			}
		}
		
		// beat calculations
		const durationOfBeat = (60000 / this.state.currentSequence.bpm);
		const currentBeatInSequence = Math.floor(currentTimeInSequence / durationOfBeat);
		const timeOfThisBeat = this.state.loopStartedAt + (currentBeatInSequence * durationOfBeat);


    // guitar heroe mode: check if current item needs to be cancelled 
    if(this.state.currentItem && this.currentItemInfo.realStartTime && this.isGuitarHeroMode()) {
      let runningSince = soundService.getSyncTime() - this.currentItemInfo.realStartTime;
      console.log("runningSince: " + runningSince);
      if(runningSince > gameService.getGuitarHeroThreshold().post && !this.currentItemInfo.approved) {
        gameService.handleMissedGuitarHeroCue();
      } 
    }

		// determine next item startime to count down to
		let startTime = null;
    if(this.state.nextItem) {
    	startTime = this.state.nextItem.startTime;
    }
    
    if(startTime != null) {

	    const timeToNextItem = startTime - currentTimeInSequence;	
	    
	    // calculate this in beats
			const beatsToNextItem = Math.floor(timeToNextItem / durationOfBeat) - 1;
      //console.log("beatsToNextItem: " + beatsToNextItem);

			// check if beats should be shown
			if(beatsToNextItem > 0 && !this.state.currentItem && !this.autoPlayNextItem()) {
				this.setReactive({beatsToNextItem: beatsToNextItem});	
			} else {
				this.setReactive({beatsToNextItem: ""});	

        // check if we are already past the next item, skip item
				if(beatsToNextItem < -1 && currentTimeInSequence > 0 && !this.autoPlayNextItem() && !this.isGuitarHeroMode()) {
						gameService.handleMissedCue();		
						this.doBeatUpdate(); // jump back to start of beatUpdate, because sequence might have shifted to next loop
						return;
				}
			}
		} else {
			this.setReactive({beatsToNextItem: ""});				
		}

    // calculate time to next update
    const timeOfNextBeat = this.state.loopStartedAt + ((currentBeatInSequence + 1) * durationOfBeat);
    //console.log("beat", currentBeatInSequence);

    if(this.state.beatTickActive) {
    	soundService.click(timeOfNextBeat);	
    }
		
    let timeToNextBeat = timeOfNextBeat - soundService.getSyncTime();

		if(this.state.controlStatus == "playing") {
			if(!timeToNextBeat) {
				timeToNextBeat = 1000;
			}
			this.beatTimeout = setTimeout(this.doBeatUpdate, timeToNextBeat);		
		}

		this.updateActionInterface();
	}



	/** INTERFACE UPDATES **/

	togglePlayButton = (value)=> {
		this.setReactive({showPlayItemButton: value});
	}

	setActionMessage = (msg)=> {
		this.setReactive({nextActionMessage: msg});
    
    if(gameService.getChallengeStatus() == "play") { // filter out action messages unless in pay mode
      gameService.clearInfoStream();
      gameService.addItemToInfoStream("info", msg);  
    }
	}

	// analyse current state and display appropriate action message
	// called on every beat and at special events (setupNextSequenceItem, sound ended)
	updateActionInterface = ()=> {
		//console.warn("updateActionInterface");
    //console.log(this.state.currentItem);

    // sequence has ended
    let endedMessage = ""; //this.state.endedFlag ? storageService.t("play-again") + " " : ""
    
		// sequence hasn't started yet
		if(this.state.controlStatus == "idle" && this.state.currentTrack) {


      // check with gameService if we are allowed to start
      if(gameService.enoughChallengeParticipantsReady()) { 
  			const firstItem = this.firstItemInTrack(this.state.currentTrack.name);
  			if(firstItem) {
  				if(firstItem.startTime == 0) {				
  					this.setActionMessage(endedMessage + storageService.t("sequence-start-first"));
  					this.activateNextUserAction();
  					
  				} else {
  					this.setActionMessage(endedMessage + storageService.t("sequence-start-any"));
  					this.deactivateUserAction();
  				}
  			} else {
  				this.setActionMessage(endedMessage + storageService.t("sequence-start-none"));
  				this.deactivateUserAction();
  			}
      } else {
        this.setActionMessage(storageService.t("waiting-for-more-participants"));
      }
		}

		// sequence is playing
		if(this.state.controlStatus == "playing") {

			if(this.state.currentItem) { // currently playing

				// activate stop gesture
				peakService.waitForStop(() => {
					gameService.handleStopItem()
				});				
				
        if(this.currentItemInfo.approved || !this.isGuitarHeroMode()) {
          //if(this.state.currentItem.sensorModulation == "off") {
            this.setActionMessage(storageService.t("sequence-playing")); 
            this.deactivateUserAction();
          /*} else {
            this.setActionMessage("you're playing! see how you can modulate the sound..."); 
            this.deactivateUserAction();
          }*/  
        }

				// check if the start time of the next item is directly after end of current item
				if(this.state.nextItem) {
					let nextStartTime = this.getStartTimeAbsolute(this.state.nextItem);
					let currentEndTime = this.getStartTimeAbsolute(this.state.currentItem) + this.state.currentItem.duration;
					// check if loop has already moved to future
					if(this.state.loopStartedAt > soundService.getSyncTime()) {
						currentEndTime -= this.state.currentSequence.custom_duration;
					}
					console.log("currentEnd vs. nextStart", currentEndTime, nextStartTime);

					if(nextStartTime < currentEndTime + 100) {
						if(!this.autoPlayNextItem()) {
							this.setActionMessage(this.state.nextActionMessage +
								" also prepare to play your next sound with the start gesture!");	
							this.activateNextUserAction();
						}
					}
				}
			
			}	else { // currently not playing

				// deactivate stop gesture
				peakService.stopWaitingForStop();

        // next sound has been scheduled
				if(this.state.scheduledItem) {
          if(this.state.scheduledItem.startTime == 0 && this.sequenceStartingLocally()) {
            this.setActionMessage(storageService.t("autoplay-info"));  
            this.togglePlayButton(false);
          } else {
            if(this.isGuitarHeroMode()) {
              this.setActionMessage(storageService.t("guitar-hero-instruct"));  
              this.activateNextUserAction();
            }
            if(this.autoPlayItem(this.state.scheduledItem)) {
              this.setActionMessage(storageService.t("autoplay-instruct")); 
              this.deactivateUserAction();
            }
          }
				} else {

					// no sound scheduled, but a next item has been set that is not on autoplay 
					if(this.state.nextItem && !this.autoPlayNextItem()) {
						this.setActionMessage(storageService.t("sensor-start-instruct"));
						this.activateNextUserAction();
					}
				}	
			}		
		}

	}

  // turns on peakservice and sets up target shape for sequence visualiser
	activateNextUserAction() {
		
    if(this.isGuitarHeroMode() && this.state.scheduledItem || this.state.currentItem) {
      const startTimeInSequence = this.state.currentItem ? this.state.currentItem.startTime : this.state.scheduledItem.startTime
      const startTime = startTimeInSequence - gameService.guitarHeroThreshold.pre
      const stopTime = startTimeInSequence + gameService.guitarHeroThreshold.post
      
      let obj = { type: null };

      // update Gesture listening
      obj = { type: "peak" };
      peakService.waitForStart(() => {
        gameService.handlePlayNextItem()
				peakService.stopWaitingForStart()
				this.deactivateUserAction()
      })  
      
      this.setReactive({
        nextUserAction: {
          type: obj.type,
          startTime,
          stopTime,
          duration: stopTime - startTime
        }
      })

      // activate play button in debug mode
      this.togglePlayButton(true);      
    }

    if (!this.isGuitarHeroMode() && this.state.nextItem) {
			const nextItemStartTimeInSequence = this.state.nextItem.startTime
			const startTime = nextItemStartTimeInSequence - gameService.assistanceThreshold
			const stopTime = nextItemStartTimeInSequence
			
			let obj = { type: null };

			// update Gesture listening
			if (this.state.nextItem.autoplay==="off") {
				obj = { type: "peak" };
				peakService.waitForStart(() => {
					gameService.handlePlayNextItem()
					peakService.stopWaitingForStart()
					this.deactivateUserAction()
				})	
			}	
			if (this.state.nextItem.gesture_id) {					
				obj = { type: "gesture" };
				gestureService.waitForGesture(nextItem.gesture_id, () => {
					gestureService.stopWaitingForGesture()
					gameService.handlePlayNextItem()
					this.deactivateUserAction()
				})
			}

			this.setReactive({
				nextUserAction: {
					type: obj.type,
					startTime,
					stopTime,
					duration: stopTime - startTime
				}
			})

			// activate play button in debug mode
			this.togglePlayButton(true);
						
		}
	}

	deactivateUserAction() {
		this.togglePlayButton(false);
		gestureService.stopWaitingForGesture();
		this.setReactive({nextUserAction: {}})
	}	

	
	
	/** CONTROL INTERFACE **/

	setSequence(sequence_id) {
		const sequence = storageService.findSequence(sequence_id);

		// if sequence has changed
		if(sequence != this.state.currentSequence) {
			this.stopSequence(); 		
			this.setReactive({currentSequence: sequence});
      this.updateActionInterface();
		}
		
	}

  loadSoundFiles = (trackName)=> {
      if(!this.state.currentSequence) {
        console.warn("no current sequence - cannot load");
        return;
      }
      soundService.unloadSoundfiles();

      // preload sound files for track
      let soundfilesToLoad = [];
      this.state.currentSequence.items.forEach((item)=>{
        if(item.track == trackName) {
          soundfilesToLoad.push(item.path);  
        }
        
      });
      this.setReactive({loadingStatus: "loading"});
      console.warn("loading soundfiles", soundfilesToLoad);
      soundService.preloadSoundfiles(soundfilesToLoad, ()=>{
        console.warn("done loading");
        this.setReactive({
          loadingStatus: "idle"
        });
        this.updateActionInterface();
      });
  }

  // on coming back to a sequence
  resetTrack() {
    if(this.state.currentTrack) {
      this.trackSelect(this.state.currentTrack);
    }
  }

  trackSelectByName(trackName) {
    this.state.currentSequence.tracks.forEach((track)=>{
      if(track.name == trackName) {
        this.trackSelect(track);
      }
    })
  }

	// invoked from track selector component
	trackSelect = (track)=> {

    if(!track) {
      this.setReactive({currentTrack: null});
      return;
    }

    if(this.state.currentTrack) {
      if(track.name != this.state.currentTrack.name) {
        this.loadSoundFiles(track.name);  
      }  
    } else {
      this.loadSoundFiles(track.name);  
    }
		
  	this.setReactive({currentTrack: track});

  	// if sequence is already running - just this.setupNextSequenceItem(); and quit
  	if(this.state.controlStatus == "playing") {
			this.cancelItemsAndSounds()
			this.setupNextSequenceItem();
			this.updateActionInterface();
			return
  	}

  	// vvvvv from here on we assume that sequence has not started yet vvvvv

		// listen for gestures if first item in track is at beginning of sequence
		console.log("checking firstItem in track " + track.name);
		const firstItem = this.firstItemInTrack(track.name);
		console.log(firstItem);
		if(firstItem) {
			//if(firstItem.startTime == 0) {				
				
				if(firstItem.gesture_id) {
					gestureService.waitForGesture(firstItem.gesture_id, () => {
						gameService.handlePlayNextItem()
						gestureService.stopWaitingForGesture()
					});
				}
				
				peakService.waitForStart(() => {
					gameService.handlePlayNextItem()
					peakService.stopWaitingForStart()
				})	
				
			//}
		}

		this.updateActionInterface();

  }

  // start sequence playback - localStart marks if sequence was started on this device
 	startSequence = (startTime, localStart) => {
		if(this.state.controlStatus != "idle") {
			console.warn("sequence already running");
			return;
		}

		let time = startTime;
		if(!time) {
			soundService.getSyncTime();
		}

		this.setReactive({
		 	controlStatus: "playing",
		 	playbackStartedAt: time,
			loopStartedAt: time,
			isLooping: gameService.isChallengeLooping()
    });

  	console.log("started sequence at", this.state.loopStartedAt, "localStart:", localStart);
    // this.showNotification("sequence started");
		this.localStart = localStart;

		this.setupNextSequenceItem();
		this.doBeatUpdate();
	}

	// identifies next item and schedules for playback if autoplay is activated
	/* called from:
	- startSequence
	- trackSelect (if track is changed)
	- scheduleSoundForNextItem (wehn playback starts and after playback ends)
	- skipNextItem
	- stopCurrentSound
	- setupNextSequenceItem (if end of loop reached)

	set up next item based on:
	- check where we are in sequence
	- check which track is activated

	-> doesn't matter if called multiple times
	*/
	setupNextSequenceItem = ()=> {
			console.log("setupNextSequenceItem");

			if(!this.state.currentSequence) {
				console.log("sequence has ended, aborting");
				return;
			}

			if(!this.state.currentTrack) {
				console.log("no track found, aborting");
				return;
			}


			this.deactivateUserAction()

			// calculate total time in playback
			const currentTime = soundService.getSyncTime();
    	const currentTimeInPlayback = currentTime - this.state.playbackStartedAt;

    	console.log("currentTimeInPlayback", currentTimeInPlayback);
    	
			// figure out what loop we are on - only save this locally in function
			let loopCounter = Math.floor(currentTimeInPlayback / this.state.currentSequence.custom_duration)
    	if(loopCounter < 0) loopCounter = 0

      let loopStartedAt = this.state.playbackStartedAt + (loopCounter * this.state.currentSequence.custom_duration);

  		// figure out what time inside the sequence we are on
    	const currentTimeInSequence = currentTime - loopStartedAt;
    	console.log("currentTimeInSequence", currentTimeInSequence);

			// get items sorted by start time
			let items = this.state.currentSequence.items;
			if(!items.length) return;
			items.sort((a,b) => (a.startTime > b.startTime) ? 1 : ((b.startTime > a.startTime) ? -1 : 0)); 

    	// get item with first starttime in the future and of this track
    	let nextItem = null;
    	for(let i = 0; i < items.length; i++) {
    		if(items[i].startTime > currentTimeInSequence && items[i].track == this.state.currentTrack.name) {
          nextItem = items[i];
    			break;
    		}
    	}

    	// if we don't find an item on first pass, take the first item in next loop
    	if(!nextItem) {    		
    		if(gameService.isChallengeLooping()) {
    			console.log("looking in next loop");
					for(let i = 0; i < items.length; i++) {
		    		if(items[i].track == this.state.currentTrack.name) {
		    			nextItem = items[i];

		    			// update sequence loop info
              loopCounter++;
		    			loopStartedAt = this.state.playbackStartedAt + loopCounter * this.state.currentSequence.custom_duration;
  						
		    			break;
		    		}
		    	}	
				}
    	}

      // only here we publish data to state!!
    	this.setReactive({
          nextItem: nextItem,
          loopCounter: loopCounter,
          loopStartedAt: loopStartedAt
      });

    	if(nextItem) {
				
    		// schedule sound for item, if necessary
				if(this.state.controlStatus == "playing" && (
								(this.isGuitarHeroMode() || this.autoPlayNextItem()) || 
								// special case where we use the play button to start sequence _and_ start first item
								(this.sequenceStartingLocally() && this.state.nextItem.startTime == 0) 
							)
					) {

          let targetTime = this.state.loopStartedAt + this.state.nextItem.startTime;
					if(!this.state.scheduledItem) {
						
            // guitar hero: approve first item automatically for guitar hero playback (no cue needed on sequence start)          
            this.scheduledItemInfo = {approved: (this.sequenceStartingLocally() && this.state.nextItem.startTime == 0)};;            
            this.scheduleSoundForNextItem(targetTime);

					} else {
						console.log("there is already a sound scheduled, abort scheduling");
					}
				}
				
    	}

    	this.updateActionInterface();
	}
		

	// call sound service to schedule sound for next item, set callback to setup next item after playback
	scheduleSoundForNextItem = (targetTime) => {
		if (!this.state.nextItem) {
			console.log("scheduleSoundForNextItem: nothing to schedule")
			return
		}
    soundService.scheduleSound(this.state.nextItem.path, targetTime, {
			onPlayStart: () => {
        this.setReactive({currentItem: this.state.scheduledItem});
        this.setReactive({scheduledItem: null});
        this.currentItemInfo.approved = this.scheduledItemInfo.approved;
        this.currentItemInfo.targetTime = targetTime;
        this.currentItemInfo.realStartTime = soundService.getSyncTime();
        this.scheduledItemInfo = {};
        if(this.currentItemInfo.approved) {
          this.turnOnVolumeCurrentItem();
        }
        this.setupNextSequenceItem();  
			},
			onPlayEnd: () => {
        // make sure we are not deleting a newer item that is now in place
        if(targetTime == this.currentItemInfo.targetTime) {
          this.currentItemInfo = {};
          this.setReactive({currentItem: null});
        }
        this.setupNextSequenceItem();
			},
		}, this.isGuitarHeroMode());  // startSilent
		this.setReactive({
			scheduledItem: this.state.nextItem,
			nextItem: null,
		});
	}

  getCurrentItemInfo() {
    return this.currentItemInfo;
  }

  turnOnVolumeCurrentItem() {
    if(this.state.currentItem) {
      soundService.setVolumeFor(this.state.currentItem.path, 0.3);
    }
    /*setTimeout(()=>{
      // make sure volume isn't turned off again by starting sound
      if(this.state.currentItem) {
        soundService.setVolumeFor(this.state.currentItem.path, 0.3);   
      }
    }, 1000);*/
  }

  turnOffVolumeCurrentItem() {
    if(this.state.currentItem) {
      soundService.setVolumeFor(this.state.currentItem.path, 0.0);
    }
  }


  // approve the next item
  approveScheduledOrCurrentItem() {
    if(this.state.currentItem) {
      this.currentItemInfo.approved = true;
      this.turnOnVolumeCurrentItem();
    } else {
      if(this.state.scheduledItem) {
        this.scheduledItemInfo.approved = true;
      }
    }    
  }


  skipNextItem() {
    console.log(this.state.nextItem);
    if(this.state.nextItem) {
      this.setupNextSequenceItem();
    }
  }

	stopCurrentSound() {
		if(this.state.currentItem) {
			console.log("stopping", this.state.currentItem);
			soundService.stopSound(this.state.currentItem.path);
			this.setReactive({currentItem: null});
			this.setupNextSequenceItem();
			this.updateActionInterface();
		}
	}

	// stops all sounds and removes all planned items - used in preparation for track switch
	cancelItemsAndSounds() {
		this.setReactive({
	    nextItem: null,
			scheduledItem: null,
	    currentItem: null
	  });
	  soundService.stopAllSounds();
	}
	
	// stops sequence playback and sound and clears sequence
	stopSequence() {
		soundService.stopAllSounds();
		this.deactivateUserAction();

		this.setReactive({
			controlStatus: "idle",
			currentSequence: null,
			currentTrack: null,
			nextItem: null,
			scheduledItem: null,
			currentItem: null,
			playbackStartedAt: null,	    	
			loopStartedAt: null,
			showPlayItemButton: false,
			beatsToNextItem: "",
			loopCounter: 0,
			sequenceTimeVisualizer: 0,
			endedFlag: true,
			nextUserAction: {}
		});

		this.localStart = false

		if(this.beatTimeout) {
			clearTimeout(this.beatTimeout);
			this.beatTimeout = null
		}
	}

  // shifts sequence to new start time
  shiftSequenceToNewStartTime = (startTime) => {
      this.setReactive({
        playbackStartedAt: startTime
      });
      this.setupNextSequenceItem();
  }
		
	// stops playing and puts existing sequence back to ready state
	resetSequence() {
		console.log("reset sequence")

		soundService.stopAllSounds();
		this.deactivateUserAction();

		this.setReactive({
			controlStatus: "idle",
			nextItem: null,
			scheduledItem: null,
			currentItem: null,
			playbackStartedAt: null,	    	
			loopStartedAt: null,
			beatsToNextItem: "",
			loopCounter: 0,
			sequenceTimeVisualizer: 0,
			endedFlag: true,
			nextUserAction: {}
		});				

		this.localStart = false

		if(this.beatTimeout) {
			clearTimeout(this.beatTimeout);
			this.beatTimeout = null
		}
	}		

}

const sequenceService = new SequenceService();

export {sequenceService};