import Service from './Service';

import { networkService } from './networkService'; // ATTENTION import from './' generates an error (undefined is not...)
import { imeiIds } from '../../config/imei';

import RNFS from 'react-native-fs';
persistentFile = RNFS.ExternalStorageDirectoryPath + '/unboxing/collections.json';

const uuidv1 = require('uuid/v1');

class StorageService extends Service {

	constructor() {

		// reactive vars
		super("storageService", {
			version: 0,
			collections: {},
      language: "en",
		});

		this.loadFromFile()		
    setTimeout(()=>{
      //this.showNotification("trying to get everything...");
      this.updateEverything();
    }, 5000);
	}

	// called from ServerConnector component
	updateEverything = async () => {
		const result = await networkService.apiRequest('getEverything')
		if (result) {
			this.setReactive(result)
			this.writeToFile();
		} else {
			//this.showNotification("no data received");
			//await this.loadFromFile();
		}
	}

	setServer(address) {
		this.setReactive({server: address});
    this.writeToFile();
	}

  getServer = () => {
    return this.state.server;
	}
	
	setCustomDeviceId(id) {
		this.setReactive({customDeviceId: id});
		this.writeToFile();
		this.updateDeviceId();
	}

	getImeiDeviceId = () => {
		return imeiIds[networkService.getImei()];
	}

	getDeviceId() {
		if(!this.state.customDeviceId || this.state.customDeviceId == " ") {
			return imeiIds[networkService.getImei()];
		} else {
			return this.state.customDeviceId;
		}
	}

	updateDeviceId() {
		this.setReactive({deviceId: this.getDeviceId()});
	}

	async loadFromFile() {
		let json = await RNFS.readFile(persistentFile, 'utf8').catch((err)=>{
			this.showNotification("loadFromFile failed: " + err.message)
			console.log(err.message, err.code)
		});
		if(json) {
			// log the file contents
	      console.log("reading collections from file", json);
	      let stateFromFile = JSON.parse(json);
				//console.log(stateFromFile);
				if (!stateFromFile.deviceId) stateFromFile.deviceId = uuidv1()
				this.setReactive(stateFromFile);
        if(!this.state.server) {
          this.setReactive({server: networkService.getDefaultServer()});
        }
				networkService.setServer(this.state.server, false); // doesn't need save, just load
		}
	}

	writeToFile() {
		// write the file
		let persistentJSON = JSON.stringify(this.state);
		RNFS.writeFile(persistentFile, persistentJSON, 'utf8')
		.then((success) => {
			console.log(this.state);
			console.log("succesfully saved collection data to file");
		})
		.catch((err) => {
			console.log("error saving collection data to file");
			console.log(err.message);
		});
	}


	// called when admin starts walk
	getActivePath = (walk)=> {
		console.log("paths");
		console.log(walk.paths);

		let pathsObj = null;
		try {
			pathsObj = JSON.parse(walk.paths);	
		}
		catch {
			console.log("error parsing paths json");
		}

		if(pathsObj) {

			let activePath = pathsObj[storageService.getDeviceId()];
			console.log("activePath");
			console.log(activePath);
		
			return activePath;
		}

		return null;
	}

	findPlace = (placeShorthand, walkTag)=> {

		for(let i = 0; i < this.state.collections.places.length; i++) {
			if(this.state.collections.places[i].tag == walkTag && this.state.collections.places[i].shorthand == placeShorthand) {
				return this.state.collections.places[i];
			}	
		}
		
		return null;
	}

  getPlaceAtIndex = (index) => {
    if(index < this.state.collections.places.length) {
      return this.state.collections.places[index];  
    }
    return null;
  }

	findChallenge(challenge_id) {
		for(let i = 0; i < this.state.collections.challenges.length; i++) {
			if(this.state.collections.challenges[i]._id == challenge_id) {
				return this.state.collections.challenges[i];
			}
		}
		return null;
	}

	findChallengeByShorthand(challenge_shorthand) {
		for(let i = 0; i < this.state.collections.challenges.length; i++) {
			if(this.state.collections.challenges[i].shorthand == challenge_shorthand) {
				return this.state.collections.challenges[i];
			}
		}
		return null;
	}


	// finds a sequence give its id
	findSequence(sequence_id) {
		for(let i = 0; i < this.state.collections.sequences.length; i++) {
			if(this.state.collections.sequences[i]._id == sequence_id) {
				return this.state.collections.sequences[i];
			}
		}
		return null;
	}

  getSequenceNameFromChallenge(challenge) {
    let s = this.findSequence(challenge.sequence_id);
    if(s) {
      return s.name
    }
    return "sequence not found";
  }

	findServer(id) {
		if(this.state.collections.servers) {
			return this.state.collections.servers.find( s => s._id == id)
		} else {
			return null
		}
	}

  setLanguage(code) {
    this.setReactive({language: code});
  }

  // return tanslated string for its key
  t(key) {
    if(this.state.collections.translations) {
      for(let i = 0; i < this.state.collections.translations.length; i++) {
        if(this.state.collections.translations[i].key == key) {
          return this.state.collections.translations[i]["content_" + this.state.language];
        }
      }
    } 
    return "[" + key + "]";
  }

}

const storageService = new StorageService();

export {storageService};