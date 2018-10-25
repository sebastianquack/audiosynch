import Service from './Service';
import { sensorService, soundService } from './';

const serviceName = "peak"
const clickFilename = '/misc/click.mp3';

class PeakService extends Service {

	constructor() {

		// reactive vars
		super(serviceName, {
			bpm: 0,
		});

		this.sensorReceiverHandle = null;

		this.isUp = y => y < -0.7
		this.isDown = y => y > 0.7

		this.peakDistMillis = 1000
		this.peakStartTime = null

		this.init();

		//this.handleSensorDataForRecognition = this.handleSensorDataForRecognition.bind(this)
	}

	init = () => {
		this.enable()
	}

	enable = () => {
		this.sensorReceiverHandle = sensorService.registerReceiver(this.handleSensorDataForRecognition)
	}

	// handle incoming sensor data for recognition
	handleSensorDataForRecognition = (data) => {
	// console.log("sensor data received", data.acc)
		const y = data.acc.y
		// detect Up and set start time
		if (this.isUp(y)) {
			this.peakStartTime = soundService.getSyncTime()
		}
		// detect down if in time
		if (this.isDown(y)) {
			if (this.peakStartTime && this.peakStartTime + this.peakDistMillis > soundService.getSyncTime()) {
				const bpm = 1000 / (soundService.getSyncTime() - this.peakStartTime)*60
				this.setReactive({bpm})
				this.peakStartTime = null
				this.showNotification("PEAK")
			}
		}

		this.setReactive({
			isUp: this.isUp(y),
			isDown: this.isDown(y),
			startTime: this.peakStartTime
		})

	}

	// run from ssequenceService to register a callback for a specific gesture
	waitForGesture = () => {		
	}

	// run from sequenceService to unregister gesture
	stopWaitingForGesture() {
	}

}

const peakService = new PeakService();

export {peakService};