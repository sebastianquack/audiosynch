import React, { Component } from 'react';
import { Text, View, StyleSheet, Dimensions } from 'react-native';
import {globalStyles} from '../../config/globalStyles';
import { bindCallback } from 'rxjs';

class SequenceVisualizer extends React.Component { 
  constructor(props) {
    super(props);
    
    this.state = {
    };
    
  }

  componentDidMount() {
  }

  componentWillUnmount() {
  }

  renderHeaderTrack = (track) => {
    const backgroundColor = ( !this.props.track || this.props.track.name == track.name ? track.color : "transparent" )
    return (
      <View style={{
          ...styles.track, 
          ...styles.headerTrack, 
          backgroundColor,
        }} key={track.name}>
        <View>
          <Text>
            {track.name}
          </Text>
        </View>
      </View>
    )
  } 

  renderBodyTrack = (track) => {
    // items belonging to this track
    sequenceItems = this.props.sequence.items.filter( item => item.track === track.name)
    actionItem = (this.props.track && this.props.nextUserAction && this.props.track.name == track.name ? this.props.nextUserAction : {} )

    return (
      <View style={{...styles.track}} key={"body " + track.name}>
        { sequenceItems.map(sequenceItem => this.renderBodyTrackItem(sequenceItem, track) ) }
        { actionItem.startTime && this.renderActionItem(actionItem) }
      </View>
    )
  }   

  renderBodyTrackItem = (item, track) => {
    const sequenceDuration = this.props.sequence.custom_duration || this.props.sequence.duration
    const leftPercentage = 100 * item.startTime / sequenceDuration
    const widthPercentage = 100 * item.duration / sequenceDuration

    const backgroundColor = ( !this.props.track || this.props.track.name == track.name ? track.color : styles.bodyTrackItem.backgroundColor )

    return (
      <View key={item._id} style={{
          ...styles.bodyTrackItem, 
          backgroundColor,
          width: widthPercentage+"%", 
          left: leftPercentage+"%",
        }}>
        <Text style={styles.bodyTrackItemText}>
          { item.name }
        </Text>    
      </View>
    )
  }

  renderActionItem = (item) => {
    const sequenceDuration = this.props.sequence.custom_duration || this.props.sequence.duration
    let leftPercentage = 100 * item.startTime / sequenceDuration
    const widthPercentage = 100 * item.duration / sequenceDuration

    if(item.startTime < 0 && this.props.loopCounter > 0) {
      leftPercentage += 100;  
    }
    
    console.log("RENDER action item", item, this.props.loopCounter)

    return (
      <View key={item._id} style={{
          ...styles.bodyTrackItem, 
          ...styles.bodyTrackItem__actionItem,
          width: widthPercentage+"%", 
          left: leftPercentage+"%",
        }}>
        <Text style={styles.bodyTrackItemText}>
          { item.type }
        </Text>    
      </View>
    )
  }

  renderIndicator = () => {    
    const sequenceDuration = this.props.sequence.custom_duration || this.props.sequence.duration
    const playing = this.props.controlStatus === "playing"
    const color = playing ? "red" : "transparent"
    const leftPercentage = this.props.currentTime ? 100 * this.props.currentTime / sequenceDuration : 0
    const width = 1 // (100 / (( sequenceDuration / 60000 ) * this.props.sequence.bpm))+"%"

    return (
      <View style={{
        ...styles.indicator,
        backgroundColor: color,
        borderColor: color,
        opacity: 0.7,
        left: leftPercentage+"%",
        width
        }} />
    )
  }

  render() {
    let tracks = null;
    if(this.props.sequence) {
      tracks = this.props.sequence.tracks
    }

    if(tracks) {
      return (
        <View> 
          <View style={styles.container}>
            <View style={styles.header}>
              {tracks.map(this.renderHeaderTrack)}
            </View>
            <View style={styles.body}>
              {tracks.map(this.renderBodyTrack)}
              {this.renderIndicator()}
            </View>
          </View>
        </View>
      );
    } else {
      return null;
    }
  }
}

export default SequenceVisualizer;

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderStyle: "solid",
    borderColor: "black",
    borderWidth: 1,
  },
  header: {
    backgroundColor: '#aaa',
    borderStyle: "solid",
    borderColor: "black",
    borderRightWidth: 1,    
  },  
  body: {
    backgroundColor: '#ddd',
    flex: 1,
  },
  track: {
    height: 30,
    justifyContent: "center",
  },
  headerTrack: {
    paddingHorizontal: 8,
  },
  bodyTrackItem: {
    backgroundColor: '#bbb',
    height: "100%",
    justifyContent: "center",
    borderRadius: 0,
    position: "absolute",
    paddingHorizontal: 8,
  },
  bodyTrackItem__actionItem: {
    borderRadius: 20,
    backgroundColor: 'yellow',
    padding: 4,
  }, 
  bodyTrackItemText: {
    flexWrap: "nowrap", // doesn't work
  },
  indicator: {
    position: "absolute",
    height: "100%",
    borderRightWidth: 0,
    borderColor: "black",
    top:0,
    left:0,
  },   
});