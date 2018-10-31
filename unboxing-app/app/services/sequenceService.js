import Service from './Service';

import {soundService, gameService, gestureService, peakService } from './';

class SequenceService extends Service {

	constructor() {

		// reactive vars - used in interface component
		super("sequence", {
			controlStatus: "idle", // idle -> loading -> ready -> playing
			currentSequence: null, // sequence object
      currentTrack: null, // track object
			playbackStartedAt: null, // start time of first loop
			startedAt: null, // start time of current sequence (in each loop)
			nextItem: null, // next item to play, if available
			scheduledItem: null, // item scheduled for play
			currentItem: null, // current item playing, if available
			showPlayItemButton: false // should play button be shown
		});

		// not reative - used for internal calculations
		this.sequenceCursor = 0; // runs through the items in the sequence during playback
		this.loopCounter = 0;
		this.localStart = false;

		this.beatTimeout = null;
	}

	/* HELPER FUNCTIONS */

	getControlStatus() {
		return this.state.controlStatus;
	}

	firstItemInTrack(track) {
		let items = this.state.currentSequence.items;
		for(let i = 0; i < items.length; i++) {
			if(items[i].track == track) {
				return items[i];
			}
		}
		return null	
	}

	getNextItemStartTimeAbsolute = ()=> {
		if (!this.state.nextItem) return
		const startTime = this.state.startedAt + this.state.nextItem.startTime;
		return startTime;
	}

	getBpm = ()=> {
		if(this.state.currentSequence) {
			return this.state.currentSequence.bpm;	
		} else {
			return null;
		}
	}

	doBeatUpdate = ()=> {
		// calculate time to next item
		const currentTime = soundService.getSyncTime();
    const currentTimeInSequence = currentTime - this.state.startedAt;

		// beat calculations
		const durationOfBeat = (60000 / this.state.currentSequence.bpm);
		const currentBeatInSequence = Math.floor(currentTimeInSequence / durationOfBeat);
		const timeOfThisBeat = this.state.startedAt + (currentBeatInSequence * durationOfBeat);

    if(this.state.nextItem) {
    	const timeToNextItem = this.state.nextItem.startTime - currentTimeInSequence;	
    
    	// calculate this in beats
			const beatsToNextItem = Math.floor(timeToNextItem / durationOfBeat);

			// update beatsToNextItem
			this.setReactive({beatsToNextItem: beatsToNextItem});
    }
    
    // calculate time to next update
    const timeOfNextBeat = this.state.startedAt + ((currentBeatInSequence + 1) * durationOfBeat);
    console.log("beat", currentBeatInSequence);
		soundService.click(timeOfNextBeat);

    let timeToNextBeat = timeOfNextBeat - soundService.getSyncTime();

		if(this.state.controlStatus == "playing") {
			if(!timeToNextBeat) {
				timeToNextBeat = 1000;
			}
			this.beatTimeout = setTimeout(this.doBeatUpdate, timeToNextBeat);		
		}
	}

	sequenceStartingLocally = ()=> {
		return this.localStart && this.sequenceCursor == 0 && this.loopCounter == 0;
	}

	// updates if play button should be shown in interface
	updatePlayButton = ()=> {
		this.setReactive({
	    	showPlayItemButton: (this.state.nextItem && !this.autoPlayNextItem())
		}); 
		console.log("updating playButton", this.state.showPlayItemButton, this.state.nextItem, this.autoPlayNextItem());
	}

	// check if next item should be autoplayed
	autoPlayNextItem = ()=> {
		if(!this.state.nextItem) return false;

		if(this.state.nextItem.autoplay == "off") {
			return false;
		}

		if(this.state.nextItem.autoplay == "first" && this.loopCounter == 0) {
			return true;
		}

		if(this.state.nextItem.autoplay == "on") {
			return true;
		}

		// we shouldn't reach this point, don't play anything
		return false;
	}

	/* CONTROL INTERFACE */

	// invoked from track selector component - sets up new sequence
	trackSelect(sequence, track) {
		this.stopSequence();
    	this.setReactive({
	      currentSequence: sequence,
	      currentTrack: track,
    	});

    	console.log("track selected, analysing sequence");
    	console.log(sequence);

		// preload all sounds from this track in sequence
		let soundfilesToLoad = [];
		sequence.items.forEach((item)=>{
			if(item.track == track.name) {
				soundfilesToLoad.push(item.path);
			}
		});
		this.setReactive({controlStatus: "loading"});
		soundService.preloadSoundfiles(soundfilesToLoad, ()=>{
			console.log("finished loading sound files for this track");
			this.setReactive({
				controlStatus: "ready",
				showPlayItemButton: true
			});

			// listen for gestures if first item in track is at beginning of sequence
			const firstItem = this.firstItemInTrack(track);
			if(firstItem) {
				if(firstItem.startTime == 0) {				
					if(firstItem.gesture_id) {
						gestureService.waitForGesture(firstItem.gesture_id, () => {
							gameService.handlePlayNextItemButton()
							gestureService.stopWaitingForGesture()
						});
					}
					if(firstItem.sensorStart) {
						peakService.waitForStart(() => {
							gameService.handlePlayNextItemButton()
							peakService.stopWaitingForStart()
						})	
					}
				}
			}
		});
  }

  // start sequence playback - localStart marks if sequence was started on this device
 	startSequence = (startTime, localStart) => {
		if(this.state.controlStatus != "ready") {
			console.log("cannot start - sequence not ready to play");
			return;
		}

		let time = startTime;
		if(!time) {
			soundService.getSyncTime();
		}

		this.setReactive({
		 	controlStatus: "playing",
	    startedAt: time
    });

  	if(this.loopCounter == 0) {
  		this.setReactive({
  			playbackStartedAt: time
  		})
  	}

  	console.log("started sequence at", this.state);
  	this.localStart = localStart;

		this.setupNextSequenceItem();

		this.doBeatUpdate();
	}

	// identifies next item and schedules for playback if autoplay is activated
	setupNextSequenceItem() {
			console.log("setting up next sequence item");
			gestureService.stopWaitingForGesture()
	    
	    let items = this.state.currentSequence.items;
	    if(!items.length) {
	      return;
	    }

	    // go through sequence to finde the next item
	    let nextItemIndex = this.sequenceCursor;
	    let nextItem = null;
	    
	    while(!nextItem && nextItemIndex < items.length) { 
	      if(items[nextItemIndex].track == this.state.currentTrack.name) {
	        nextItem = items[nextItemIndex];  
	      }
	      nextItemIndex++;
	    } 

	    if(nextItem) {
	    	this.setReactive({
	    		nextItem: nextItem, // show next item to interface
				}); 
				
				// schedule sound for item
				if(this.state.controlStatus == "playing" && (
								this.autoPlayNextItem() || 
								(this.sequenceStartingLocally() && this.state.nextItem.startTime == 0)
							)
					) {
					
					console.log("scheduling next track item in sequence");
					console.log(this.state.nextItem);
					let targetTime = this.state.startedAt + this.state.nextItem.startTime;
					this.scheduleSoundForNextItem(targetTime);

				}

				this.updatePlayButton();

				// listen for gesture
				if (nextItem.sensorStart) {
					peakService.waitForStart(() => {
						gameService.handlePlayNextItemButton()
						peakService.stopWaitingForStart()
					})	
				}				
				if (nextItem.gesture_id) {					
					gestureService.waitForGesture(nextItem.gesture_id, () => {
						gestureService.stopWaitingForGesture()
						gameService.handlePlayNextItemButton()
					})
				}

				this.sequenceCursor = nextItemIndex; // save index for later

	    } else {
				console.log("no next item found");
				
				let loop = false;
				let activeChallenge = gameService.getActiveChallenge();
				if(activeChallenge) {
					if(activeChallenge.sequence_loop) {
						loop = true;
					}
				}

				if(loop) {
					console.log("looping sequence with custom duration");
					if(!this.state.currentSequence.custom_duration || this.state.currentSequence.custom_duration == 0) {
						console.warn("custom duration not set! aborting loop");
						this.stopSequence();
						return;
					}
					this.sequenceCursor = 0; // reset cursor
					let newStartedAt = this.state.startedAt + this.state.currentSequence.custom_duration;
					console.log("newStartedAt", newStartedAt);
					this.setReactive({
					  startedAt: newStartedAt
	    			});
	    			console.log(this.state);
	    			this.loopCounter++;
					this.setupNextSequenceItem();
				} else {
					this.stopSequence();
				}
	    }
	}
		
	skipNextItem() {
		console.log(this.state.nextItem);
		if(this.state.nextItem) {
			this.setupNextSequenceItem();
		}
	}

	// call sound service to schedule sound for next item, set callback to setup next item after playback
	// needs to wait because currently soundService can only save one targetTime per sound
	// also useful if we want to be able to turn autoplay on and off
	scheduleSoundForNextItem(targetTime) {
		if (!this.state.nextItem) return
		soundService.scheduleSound(this.state.nextItem.path, targetTime, {
			onPlayStart: () => {
				this.setReactive({
					currentItem: this.state.scheduledItem,
				});
			},
			onPlayEnd: () => {
				this.setReactive({currentItem: null});
				this.setupNextSequenceItem();
			}
		});
		this.setReactive({
			scheduledItem: this.state.nextItem,
			nextItem: null,
		});
		this.updatePlayButton();
	}

	stopCurrentSound() {
		console.log(this.state.currentItem);
		soundService.stopSound(this.state.currentItem.path);
		this.setReactive({currentItem: null});
		this.setupNextSequenceItem();
	}
	
	// stops sequence playback and sound
	stopSequence() {
			soundService.stopAllSounds();
			gestureService.stopWaitingForGesture();
	    this.setReactive({
	    	controlStatus: "idle",
	    	currentItem: null,
	    	nextItem: null,
	    	startedAt: null,
			playbackStartedAt: null,
			showPlayItemButton: false,
	    });
	    this.sequenceCursor = 0;
	    this.loopCounter = 0;
	    if(this.beatTimeout) {
	    	clearTimeout(this.beatTimeout);
	    	this.beatTimeout = null
	    }
  	}

}

const sequenceService = new SequenceService();

export {sequenceService};