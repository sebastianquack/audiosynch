import Service from './Service';

import NearbyConnection, {CommonStatusCodes, ConnectionsStatusCodes, Strategy, Payload, PayloadTransferUpdate} from 'react-native-google-nearby-connection';

import {gameService, storageService, soundService} from './';

const uuidv1 = require('uuid/v1');

const strategy = Strategy.P2P_CLUSTER;

class NearbyService extends Service {

	constructor() {
		// reactive vars
		super("nearbyService", {
			active: false,					// general on / off switch for nearby
			serviceId: "default", 				// service id for discovery & advertising
			discoveryActive: false,			// true if discovery service is active
			advertisingActive: false,		// true if advertising service is active			
			endpointInfo: {},				// status of all known endpoints {myNearbyStatus: "discovered" / "connected", meshStatus: "available" / "unknown"}
			lastHealthCheckSent: 0,  // timestamp of last healthcheck we sent
			messageCounter: 0,					// count all incoming messages
			messageLog: ""
		});
		this.customCallbacks = {
			onConnectionEstablished: null, 	// not implemented
			onMessageReceived: null,
			onConnectionLost: null, 		// not implemented
		}
		this.receivedPayloads = {};
		this.setupNearbyCallbacks();		
		
		this.endpointPingInterval;
		this.endpointPingIntervalTime = 5000; // rythm of checking enpointInfo and initiating connections
		this.healthCheckInterval = 5000; // rythm of checking in with connected nodes
		this.connectionTimeout = 30000; // time after which we abort connection request
		this.discoveryTimeout = 60000; // time after which entries are deleted from discovered list
	}


  /* Helper functions */

	debug = (...msg) => {
		// this.showNotification(msg.join(", "));
		console.log(msg);  
	}

  // update the endpointInfo object for a specified endpoint, only change the keys in update object
  updateEndpointInfo(endpointId, update) {
    let newEndpointInfo = this.state.endpointInfo;

    if(!newEndpointInfo[endpointId]) {
      newEndpointInfo[endpointId] = {};
    }

    Object.keys(update).forEach((key)=>{
      newEndpointInfo[endpointId][key] = update[key]; 
    });

    this.setReactive({endpointInfo: newEndpointInfo});
  }

  // for example count these: ("myNearbyStatus", "connected")
  countEndpointsWithStatus = (statusKey, statusValue)=> {
    let r = Object.values(this.state.endpointInfo).filter( (value) => {
      return (value[statusKey] === statusValue)
    }).length
    return r;
  }

  // extracts my endpointId from device info
  getMyEnpointId() {
    let myEnpointId = null;
    Object.entries(this.state.endpointInfo).forEach(([endpointId, value]) => {
      if(value.name == storageService.getDeviceId()) {
        myEnpointId = endpointId;
      }
    })
    return myEnpointId;
  }

  // save callbacks set in gameservice
  setCustomCallbacks(callbacks) {
    Object.keys(callbacks).forEach((key)=>{
      this.customCallbacks[key] = callbacks[key];
    });
    console.log(this.customCallbacks);
  }

  // shuffle an array
  shuffle(array) {
    var currentIndex = array.length, temporaryValue, randomIndex;

    // While there remain elements to shuffle...
    while (0 !== currentIndex) {

      // Pick a remaining element...
      randomIndex = Math.floor(Math.random() * currentIndex);
      currentIndex -= 1;

      // And swap it with the current element.
      temporaryValue = array[currentIndex];
      array[currentIndex] = array[randomIndex];
      array[randomIndex] = temporaryValue;
    }

    return array;
  }



  /* Starting and Stopping */

	initNearbyWithServiceId = (serviceId)=> {
		// update state
		this.setReactive({
      active: true,
      serviceId: serviceId
    });

    // start heartbeat function
		this.pingEndpoints();
		this.endpointPingInterval = setInterval(this.pingEndpoints, this.endpointPingIntervalTime);

    // start advertising and discovery
		this.startDiscovering(serviceId);
		this.startAdvertising(serviceId);
	}

  shutdownNearby() {
    this.stopDiscovering(this.state.serviceId);
    this.stopAdvertising(this.state.serviceId);
    clearInterval(this.endpointPingInterval);

    // disconnect from all endpoints
    Object.keys(this.state.endpointInfo).forEach((endpointId)=>{
      this.disconnectEndpoint(endpointId);
    });

    // update state
    this.setReactive({
      serviceId: "default",
      active: false,
      endpointInfo: {} // this completely whipes info about the network!
    });
  }

  startDiscovering(serviceId) {
    NearbyConnection.startDiscovering(
          serviceId,
          strategy
    );
    this.setReactive({discoveryActive: true});
  }

  stopDiscovering(serviceId) {
    this.debug("nearby: stopping discovery");
    NearbyConnection.stopDiscovering(serviceId);
    this.setReactive({ discoveryActive: false });   
  }

  startAdvertising(serviceId) {
    NearbyConnection.startAdvertising(
        storageService.getDeviceId(),
        serviceId,
        strategy
    );
    this.setReactive({advertisingActive: true});
  }

  stopAdvertising(serviceId) {
    if(this.state.advertisingActive) {
      this.debug("nearby: stopping advertising", storageService.getDeviceId());
      NearbyConnection.stopAdvertising(serviceId);
      this.setReactive({ advertisingActive: false });
    }
  }


  /* periodic heartbeat function that checks in with nearby endpoints */
  
	pingEndpoints = ()=> {
		if(this.state.active) {

			console.log("ping endpoints");
		
			// is it time to send another health check
			if(soundService.getSyncTime() - this.state.lastHealthCheckSent > this.healthCheckInterval) {
								
				// send a health check message to everyone
				//if(storageService.getDeviceId() == "2") {

					if(this.getMyEnpointId()) {

						console.log("sending alive message");
						//this.showNotification("sending alive");

						this.broadcastMessage({
							message: "alive",
							originator: storageService.getDeviceId(),
							originatorId: this.getMyEnpointId()
						}, this.getMyEnpointId(), true);
						this.setReactive({lastHealthCheckSent: soundService.getSyncTime()});

					}

				//}
				
			}
			
			let connectionCounter = 0; 
			const connectionMaxPerPing = 1; // maximum number of connections to initiate at the same time

			// shuffle keys to not try the same connection each time
			let shuffledKeys = this.shuffle(Object.keys(this.state.endpointInfo));

			shuffledKeys.forEach((endpointId)=>{
				
				// decide if we want to connect to a new node
				if(this.state.endpointInfo[endpointId].myNearbyStatus == "discovered") {

					// if less than 2 connected endpoints and discovered endpoint is not available in mesh, connect
					if (
						(this.countEndpointsWithStatus("myNearbyStatus", "connected") + this.countEndpointsWithStatus("myNearbyStatus", "connecting")) < 2 
						&& this.state.endpointInfo[endpointId]
						&& this.state.endpointInfo[endpointId].meshStatus !== "available" 
						&& connectionCounter < connectionMaxPerPing
						) {

							if(this.state.endpointInfo[endpointId].name > storageService.getDeviceId()) {
								this.connectToEndpoint(endpointId);
								this.updateEndpointInfo(endpointId, {myNearbyStatus: "connecting"});
								connectionCounter++;	
							} else {
								this.showNotification("waiting for " + this.state.endpointInfo[endpointId].name + " to connect");
							}
					}
				}

				// check alive status of all nodes that are not me
				if(this.state.endpointInfo[endpointId].name != storageService.getDeviceId()) {
					
					// mark nodes with meshstatus gone that we havent heard from in 4 cycles
					if(soundService.getSyncTime() - this.state.endpointInfo[endpointId].lastHeardFrom > this.healthCheckInterval * 4) {
						// we lost connection
						this.showNotification("havent heard from " + this.state.endpointInfo[endpointId].name);
						if(this.state.endpointInfo[endpointId].myNearbyStatus =! "connected") {
							this.updateEndpointInfo(endpointId, {meshStatus: "gone"});	
						}
					}

					// check if a neighbor connection is lost - disconnect
					if(soundService.getSyncTime() - this.state.lastHealthCheckSent > this.healthCheckInterval) {
						if(soundService.getSyncTime() - this.state.endpointInfo[endpointId].lastHeardFromAsNeighbor > this.healthCheckInterval * 2) {
							this.disconnectEndpoint(endpointId, {myNearbyStatus: "discovered"})
						}
					}					
					
					// stop waiting for connection comeplte when node becomes available in mesh
					if(this.state.endpointInfo[endpointId].myNearbyStatus == "connecting"
						&& (soundService.getSyncTime() - this.state.endpointInfo[endpointId].connectionInitTimestamp > this.connectionTimeout
						|| this.state.endpointInfo[endpointId].meshStatus == "available"
						)) {
						this.updateEndpointInfo(endpointId, {myNearbyStatus: "discovered"});	
					}

					// purge gone nodes that were discovered long ago
					if(soundService.getSyncTime() - this.state.endpointInfo[endpointId].lastHeardFrom > this.discoveryTimeout) {
						if(this.state.endpointInfo[endpointId].meshStatus != "available" 
							&& this.state.endpointInfo[endpointId].myNearbyStatus == "discovered") {
								delete this.state.endpointInfo[endpointId];
						} 
					}
				}
				
			});
		}
	}


  /* specific actions */

  connectToEndpoint(endpointId) {
    this.debug("nearby: connecting to ", this.state.serviceId, endpointId);
    NearbyConnection.connectToEndpoint(
        this.state.serviceId,         // A unique identifier for the service
        endpointId
    );
    this.updateEndpointInfo(endpointId, {connectionInitTimestamp: soundService.getSyncTime()});
  }

  disconnectEndpoint = (endpointId, endpointInfoUpdate = {}, quiet = false) => {
    this.showNotification("disconnecting endpoint " + endpointId + " " + (quiet ? "I was told" : "my decision"))

    if (!quiet) {
      this.sendMessageToEndpoint(endpointId, {message: "disconnect"})
    }

    let serviceId = this.state.serviceId; // save serviceId because of timeout below

    setTimeout(() => {
      NearbyConnection.disconnectFromEndpoint(
        serviceId,              // A unique identifier for the service
        endpointId              // ID of the endpoint we wish to disconnect from
      );
      this.updateEndpointInfo(endpointId, endpointInfoUpdate);  
      if(this.countEndpointsWithStatus("myNearbyStatus", "connected") < 2) {
        this.startDiscovering(this.state.serviceId);  
        this.startAdvertising(this.state.serviceId);  
      } 
    }, (quiet ? 0 : 1000) )

  } 

  // send message to an endpoint
  sendMessageToEndpoint(endpointId, message) {
    message.sender = storageService.getDeviceId();
    message.senderId = this.getMyEnpointId();
    console.log("sendMessageToEndpoint", endpointId, message);
    NearbyConnection.sendBytes(
        this.state.serviceId,           // A unique identifier for the service
        endpointId,             // ID of the endpoint
        JSON.stringify(message)     // A string of bytes to send
    );
    this.setReactive({messageLog: this.state.messageLog + "\nme->" + this.state.endpointInfo[endpointId].name + ": " + message.message + " (originator: " + message.originator + ")"});
  }

  // send message to all connected endpoints, exlude one (usually where it came from)
  broadcastMessage = (message, excludeId=null, directional=false) => {
    const common_uuid = uuidv1() // create a common uuid for both directions if necessary
    // send to connected neighbors
    Object.entries(this.state.endpointInfo).forEach(([endpointId, value])=>{
      if(excludeId != endpointId) {
        if (value.myNearbyStatus === "connected"){
          const uuid = message.uuid || (directional ? uuidv1() : common_uuid) // directional message has different uuid for each direction
          this.sendMessageToEndpoint(endpointId, {...message, uuid});
        } 
      }
    })
  }
	
  // react to detected connection loop
  fixLoop = (hops) => {
    
    hops.push(this.getMyEnpointId()); // add myself to list
    const availableEndpointsSorted = hops.sort(); // sort alphabetically
    const responsibleEndpointId = availableEndpointsSorted[0] // take first endpointId in list
    
    // am I responsible to solve this?
    if (responsibleEndpointId === this.getMyEnpointId()) {
      // disconnect the endpoint next in list
      const connectedEnpoints = Object.entries(this.state.endpointInfo)
      .filter( ([endpointId, endpoint]) => endpoint.myNearbyStatus === "connected")
      .sort( ([endpoint1Id], [endpoint2Id]) => endpoint1Id.localeCompare(endpoint2Id))

      if(connectedEnpoints.length < 2) {
        return; 
      }

      const endpointIdToDisconnect = connectedEnpoints[0][0];

      this.showNotification("I need to fix the loop by disconnecting " + endpointIdToDisconnect)
      this.disconnectEndpoint(endpointIdToDisconnect, {myNearbyStatus: "suspended", meshStatus: "removed"})
    }
  }

	

  /* callbacks for nearby events */

  setupNearbyCallbacks() {
		NearbyConnection.onDiscoveryStarting(({
    		serviceId               // A unique identifier for the service
		}) => {
			this.debug("onDiscoveryStarting", serviceId)
		});

		NearbyConnection.onDiscoveryStarted(({
    		serviceId               // A unique identifier for the service
		}) => {
    		// Discovery services has started
			this.debug("onDiscoveryStarted", serviceId);
		});

		NearbyConnection.onDiscoveryStartFailed(({
    		serviceId,              // A unique identifier for the service
    		statusCode              // The status of the response [See CommonStatusCodes](https://developers.google.com/android/reference/com/google/android/gms/common/api/CommonStatusCodes)
		}) => {
			// Failed to start discovery service
			this.debug("onDiscoveryStartFailed", serviceId, statusCode);
		});

		NearbyConnection.onEndpointDiscovered(({
		    endpointId,             // ID of the endpoint discovered
		    endpointName,           // The name of the remote device we're connecting to. -> this seems to be the only point were we have id and name
		    serviceId               // A unique identifier for the service
		}) => {
		    // An endpoint has been discovered we can connect to - save it!
		    this.debug("onEndpointDiscovered", endpointId, endpointName, serviceId);
				this.updateEndpointInfo(endpointId, {myNearbyStatus: "discovered", name: endpointName});
				
				// connection is initiated in pingEndpoints
		});

		// Note - Can take up to 3 min to time out
		// Does not mean much - keeps on receiving messages
		NearbyConnection.onEndpointLost(({
    		endpointId,             // ID of the endpoint we lost
    		endpointName,           // The name of the remote device we lost
    		serviceId               // A unique identifier for the service
		}) => {
			// Endpoint moved out of range or disconnected
    	this.debug("received onEndpointLost", endpointId, endpointName, serviceId)
    	if(this.state.endpointInfo[endpointId]) {
    		this.showNotification("received onEndpointLost: " + this.state.endpointInfo[endpointId].name);	
    	}
    	
    	// this.updateEndpointInfo(endpointId, {myNearbyStatus: "nearbyLost"});

    	// if(this.countEndpointsWithStatus("myNearbyStatus", "connected") < 2) {
    	// 	this.startDiscovering();	
    	// 	this.startAdvertising();	
    	// }
		});

		// this is fired on both sender's and receiver's ends - regardless of advertisting or discovery
		NearbyConnection.onConnectionInitiatedToEndpoint(({
		    endpointId,             // ID of the endpoint wishing to connect
		    endpointName,           // The name of the remote device we're connecting to. // this is always discoverer
		    authenticationToken,    // A small symmetrical token that has been given to both devices.
		    serviceId,              // A unique identifier for the service
		    incomingConnection      // True if the connection request was initated from a remote device. - possibly set the wrong way?
		}) => {
    		// Connection has been initated
				this.debug("onConnectionInitiatedToEndpoint", endpointId, endpointName, serviceId);
				//this.showNotification("onConnectionInitiatedToEndpoint: " + endpointId + " " + endpointName + " " + serviceId);

    		// only accept a new connection if I don't have 
    		if(this.countEndpointsWithStatus("myNearbyStatus", "connected") < 2) {
    			NearbyConnection.acceptConnection(serviceId, endpointId); 	
    		} else {
    			NearbyConnection.rejectConnection(
    				serviceId,               // A unique identifier for the service
    				endpointId               // ID of the endpoint wishing to reject the connection from
					);
    		}    		
		});

		NearbyConnection.onConnectedToEndpoint(({
		    endpointId,             // ID of the endpoint we connected to
		    endpointName,           // this is always discoverers name? not sure - can also be advertisers name if we are on discoverer
		    serviceId,              // A unique identifier for the service
		}) => {
		    // Succesful connection to an endpoint established
				this.debug("onConnectedToEndpoint", endpointId, endpointName, serviceId);
				//this.showNotification("onConnectedToEndpoint: " + endpointId + " " + endpointName + " " + serviceId);
				
				// update local endpointInfo object
				this.updateEndpointInfo(endpointId, {
					myNearbyStatus: "connected", 
					lastHeardFrom: soundService.getSyncTime()
				});
				
				// broadcast endpointInfo object
				this.broadcastMessage({
					message: "endpointInfo",
					originator: storageService.getDeviceId(),
					endpointInfo: this.state.endpointInfo
				})
				
				// possibly turn off discovery here if 2 connections
				if(this.countEndpointsWithStatus("myNearbyStatus", "connected") >= 2) {
					this.stopDiscovering();
					this.stopAdvertising();
				}

		});

		NearbyConnection.onEndpointConnectionFailed(({
    endpointId,             // ID of the endpoint we failed to connect to
    endpointName,           // The name of the service
    serviceId,              // A unique identifier for the service
    statusCode              // The status of the response [See CommonStatusCodes](https://developers.google.com/android/reference/com/google/android/gms/common/api/CommonStatusCodes)
		}) => {
		    this.showNotification("onEndpointConnectionFailed");
		    this.updateEndpointInfo(endpointId, {myNearbyStatus: "discovered"});
		    // Failed to connect to an endpoint
		});

		NearbyConnection.onDisconnectedFromEndpoint(({
		    endpointId,             // ID of the endpoint we disconnected from
		    endpointName,           // The name of the service
		    serviceId,              // A unique identifier for the service
		}) => {
		    // Disconnected from an endpoint
		    this.showNotification("onDisconnectedFromEndpoint " + endpointName);
		    this.updateEndpointInfo(endpointId, {myNearbyStatus: "discovered"});
		});

		NearbyConnection.onAdvertisingStarting(({
		    endpointName,            // The name of the service thats starting to advertise
		    serviceId,               // A unique identifier for the service
		}) => {
		    // Advertising service is starting
		    this.debug("onAdvertisingStarting", serviceId);
		});

		NearbyConnection.onAdvertisingStarted(({
		    endpointName,            // The name of the service thats started to advertise
		    serviceId,               // A unique identifier for the service
		}) => {
		    // Advertising service has started
		    this.debug("onAdvertisingStarted", endpointName, serviceId);
		    this.setReactive({advertisingActive: true});
		});

		NearbyConnection.onAdvertisingStartFailed(({
		    endpointName,            // The name of the service thats failed to start to advertising
		    serviceId,               // A unique identifier for the service
		    statusCode,              // The status of the response [See CommonStatusCodes](https://developers.google.com/android/reference/com/google/android/gms/common/api/CommonStatusCodes)
		}) => {
		    // Failed to start advertising service
		    this.debug("onAdvertisingStartFailed", endpointName, serviceId, statusCode);
		});

		NearbyConnection.onSendPayloadFailed(({
    serviceId,              // A unique identifier for the service
    endpointId,             // ID of the endpoint wishing to connect
    statusCode              // The status of the response [See CommonStatusCodes](https://developers.google.com/android/reference/com/google/android/gms/common/api/CommonStatusCodes)
		}) => {
    	// Failed to send a payload
    	this.debug("onSendPayloadFailed", endpointId, serviceId, statusCode);
		});

		NearbyConnection.onReceivePayload(({
    		serviceId,              // A unique identifier for the service
    		endpointId,             // ID of the endpoint we got the payload from
    		payloadType,            // The type of this payload (File or a Stream) [See Payload](https://developers.google.com/android/reference/com/google/android/gms/nearby/connection/Payload)
    		payloadId               // Unique identifier of the payload
		}) => {
    		// Payload has been received
    		//this.debug("onReceivePayload");
    		const theEndpointId = endpointId;
			NearbyConnection.readBytes(
			    serviceId,               // A unique identifier for the service
			    endpointId,              // ID of the endpoint 
			    payloadId                // Unique identifier of the payload
			).then(({
			    type,                    // The Payload.Type represented by this payload
			    bytes,                   // [Payload.Type.BYTES] The bytes string that was sent
			    payloadId,               // [Payload.Type.FILE or Payload.Type.STREAM] The payloadId of the payload this payload is describing
			    filename,                // [Payload.Type.FILE] The name of the file being sent
			    metadata,                // [Payload.Type.FILE] The metadata sent along with the file
			    streamType,              // [Payload.Type.STREAM] The type of stream this is [audio or video]
			}) => {
				let msgObj = {};
				this.debug("payload from ", theEndpointId, bytes);
			    try {
			        msgObj = JSON.parse(bytes);
			    } catch(e) {
			        this.debug(e);
			        msgObj = {message: bytes};
				}

				//this.showNotification("message received from " + endpointId + ": " + bytes)
				this.setReactive({messageCounter: this.state.messageCounter+1});

				this.setReactive({messageLog: this.state.messageLog + "\n" + msgObj.originator + "->" + msgObj.sender + "->me: " + msgObj.message + " uuid:" + (msgObj.uuid ? "..."+msgObj.uuid.substr(-3) : "-" )});

				// extract info about direct neighbour
				if(!this.state.endpointInfo[endpointId]) {
					this.state.endpointInfo[endpointId] = {};
				}
				this.state.endpointInfo[endpointId].name = msgObj.sender;
				this.state.endpointInfo[endpointId].lastHeardFrom = soundService.getSyncTime();

				// remember when we heard from our neighbors
				const neighborIds = Object
					.entries(this.state.endpointInfo)
					.filter(([endpointId, endpoint]) => endpoint.myNearbyStatus == "connected" ) // only neighbors
					.map(([endpointId, endpoint]) => endpointId) // extract endpointIds
				if (neighborIds.indexOf(msgObj.senderId) > -1) {
					this.state.endpointInfo[endpointId].lastHeardFromAsNeighbor = soundService.getSyncTime();
				}

				// disconnect if we are asked to
				if (msgObj.message === "disconnect") {
					this.disconnectEndpoint(endpointId, {myNearbyStatus: "disconnected"}, true)
				}

				// extract info about broadcast orginator
				if(msgObj.message == "alive" && msgObj.originatorId) {
					
					if(msgObj.originatorId == this.getMyEnpointId()) {
						this.showNotification("my alive message came back to me - closed loop!");
						this.fixLoop(msgObj.hops)
					}

					if(!this.state.endpointInfo[msgObj.originatorId]) {
						this.state.endpointInfo[msgObj.originatorId] = {};
					}
					this.state.endpointInfo[msgObj.originatorId].meshStatus = "available";	
					this.state.endpointInfo[msgObj.originatorId].lastHeardFrom = soundService.getSyncTime();
				} 
				
				// save
				this.setReactive({endpointInfo: this.state.endpointInfo});

				// tell sender about her own id (and only do this once)
				if(msgObj.message == "idPingback")	{
					if(!this.state.endpointInfo[msgObj.endpointId]) {
						this.state.endpointInfo[msgObj.endpointId] = {};
					}
					// set my own name for this id if someone sends me a message with idPingback
					this.state.endpointInfo[msgObj.endpointId].name = storageService.getDeviceId();
					this.setReactive({endpointInfo: this.state.endpointInfo});
				
				} else {
					// if this is not a pingback message, do the pingback
					if(msgObj.senderId != endpointId) {  // check if sender's id is the same as what I see
						this.sendMessageToEndpoint(endpointId, {message: "idPingback", endpointId: endpointId});	
					}
				}
				
				// do we want to forward this message?
				if(

				// no, if it's a pingback or disconnect message (never forward those)
				msgObj.message != "idPingback"
				
				&& msgObj.message != "disconnect"

				// yes, if we haven't seen its uuid yet
				&& (!this.receivedPayloads[msgObj.uuid]

				)) {
					
					this.receivedPayloads[msgObj.uuid] = true;

					if(msgObj.message == "alive") {
						if(!msgObj.hops) {
							msgObj.hops = [];
						}
						msgObj.hops.push(this.getMyEnpointId());
					}

					this.broadcastMessage(msgObj, endpointId) // this is where we forward messaqge to broadcast, excluding sender

					// update message status from received object
					if (msgObj.message === "endpointInfo") {	
					
						for ( let key in msgObj.endpointInfo) {
							if(!this.state.endpointInfo[key]) {
								this.state.endpointInfo[key] = {};
							}
							// this.state.endpointInfo[key].meshStatus = msgObj.endpointInfo[key].meshStatus
							// just extract and copy names for future reference
							if(msgObj.endpointInfo[key].name) {
								this.state.endpointInfo[key].name = msgObj.endpointInfo[key].name
							}
						}
						this.setReactive({endpointInfo: this.state.endpointInfo});
					
					}

					if(typeof this.customCallbacks.onMessageReceived === "function") {
						this.customCallbacks.onMessageReceived(msgObj);
					}	
				}
	    
			});
		});
	}
}

const nearbyService = new NearbyService();

export {nearbyService};