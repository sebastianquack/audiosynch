import React, { Component } from 'react';

import {
  Text,
  View,
  TouchableOpacity,
  Switch
} from 'react-native';

import {globalStyles} from '../../../config/globalStyles';

import {soundService, networkService} from '../../services';
import {withSoundService, withNetworkService} from '../ServiceConnector';

const clickFilename = '/misc/click.mp3';

class TimeSync extends React.Component { 
  constructor(props) {
  	super(props);

    this.state = {
      testClick: false
    };

    this.handleTestClickSwitch = this.handleTestClickSwitch.bind(this);
    this.handleSyncPress = this.handleSyncPress.bind(this);
  }

  // time sync controls
  handleSyncPress() {
    console.log("sync button pressed, calling server");
    networkService.doTimeSync()
  }

  handleTestClickSwitch(value) {
    this.setState({testClick: value}, ()=>{
      if(value == true) {
        soundService.startTestClick()
      } else {
        soundService.stopTestClick()
      }
    });    
  }

  render() {
  	return (
  		<View>
        <Text>Sync status: {this.props.networkService.timeSyncStatus}</Text>
        <Text>Time delta: {this.props.soundService.delta}</Text>
        
        <View style={globalStyles.buttons}>
          <TouchableOpacity style={globalStyles.button} onPress={this.handleSyncPress}>
            <Text>Sync Time</Text>
          </TouchableOpacity>
          <TouchableOpacity style={globalStyles.button} onPress={()=>soundService.modifyDelta(5)}>
            <Text>+5</Text>
          </TouchableOpacity>
          <TouchableOpacity style={globalStyles.button} onPress={()=>soundService.modifyDelta(-5)}>
            <Text>-5</Text>
          </TouchableOpacity>
          <View>
            <Text>Test Click</Text>
            <Switch value={this.state.testClick} onValueChange={this.handleTestClickSwitch}/>
          </View>
        </View>

         <TouchableOpacity 
          style={globalStyles.button}
          onPress={()=>{
            soundService.runSoundTest();
          }}><Text>Run Crazy Sound Test</Text>
        </TouchableOpacity>
        <Text style={{marginBottom: 20}}>soundService errorLog: {JSON.stringify(this.props.soundService.errorLog)}</Text>
        
      </View>
  	);
  }
}





export default withNetworkService(withSoundService(TimeSync));
//export default TimeSync