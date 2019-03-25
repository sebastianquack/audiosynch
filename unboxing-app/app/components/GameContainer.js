import React, { Component } from 'react';
import { Text, View, StyleSheet, TouchableOpacity } from 'react-native';
import Meteor, { ReactiveDict, withTracker, MeteorListView } from 'react-native-meteor';
import {globalStyles} from '../../config/globalStyles';

import {withGameService, withSequenceService, withNearbyService, withPeakService} from './ServiceConnector';
import {gameService, sequenceService, storageService} from '../services';

import ScreenContainer from './ScreenContainer'
import PrimaryScreen from './PrimaryScreen'
import SecondaryScreen from './SecondaryScreen'
import StatusBar from './StatusBar'
import Button from './Button'
import ConnectionIndicator from './ConnectionIndicator'

import ChallengeView from './ChallengeView';
import TrackSelector from './TrackSelector';
import {InfoStream} from './InfoStream';
import Welcome from './Welcome';

class GameContainer extends React.Component { 
  constructor(props) { 
    super(props);
    this.state = {};
  }

  render() {

    let statusBar = null;
    let mainContent = null; 
    let scrollContent = null;
    let infoStreamContent = null;
    let overlayContent = null;
    let secondaryScreen = null;
    let buttonLeft = null;
    let buttonMid = null;
    let buttonRight = null;
    let modalContent = null;
    let buttonModal = null;

    // configure content
    if(this.props.gameService.activeChallenge) {
      statusBar = <StatusBar title={this.props.gameService.statusBarTitle} description={this.props.gameService.statusBarSubtitle} />
      mainContent = <ChallengeView/>        
    } else {
      if(this.props.gameService.walkStatus != "ended" && this.props.gameService.walkStatus != "tutorial-intro") {
        mainContent = <Welcome
          supertitle={storageService.t("main-title-super")}
          title={storageService.t("main-title")}
          subtitle={storageService.t("main-title-sub")}
        />
      }
    }

    // special case: tutorial
    if(
      this.props.gameService.walkStatus == "tutorial-intro" || 
      this.props.gameService.challengeStatus == "tutorial") {
      secondaryScreen = this.props.gameService.activePath.startInstrument ? <SecondaryScreen type="instrument" instrument={this.props.gameService.activePath.startInstrument} /> : null;
    }  

    if(this.props.gameService.walkStatus == "tutorial-intro") {
      buttonRight = <Button text={storageService.t("continue")} onPress={()=>{gameService.handleRightButton()}}/>;
    }
    
    // configure modal
    if(this.props.gameService.showInstrumentSelector) {
        modalContent = <TrackSelector sequence={this.props.sequenceService.currentSequence}/>
        buttonModal = <Button type="wide" text="Auswählen" onPress={()=>{gameService.handleCloseModal()}}/>
    }
    
    // configure secondary screen and buttons
    const instrumentName = this.props.sequenceService.currentTrack ? this.props.sequenceService.currentTrack.name : null
    
    switch(this.props.gameService.challengeStatus) {
      case "navigate": 
        buttonRight = <Button text="Check In" onPress={()=>{gameService.handleRightButton()}}/>; 
        secondaryScreen = <SecondaryScreen type="navigation" target="default" />;
        break;

      case "tutorial":
        buttonRight = this.props.gameService.tutorialStatus == "complete" ?
          <Button text={storageService.t("continue")} onPress={()=>{gameService.handleRightButton()}}/> : null;  
        break;
      
      case "prepare": 
        buttonLeft = <Button type="home" text="Exit" onPress={()=>{gameService.handleLeftButton()}}/>;
        buttonRight = instrumentName ? <Button text="Play" onPress={()=>{gameService.handleRightButton()}}/> : null;
        secondaryScreen = <SecondaryScreen type="instrument" instrument={instrumentName} />;
        if(!(this.props.gameService.activeWalk.tutorial && this.props.gameService.pathIndex == 0)) {
          buttonMid = <Button type="change" onPress={()=>{gameService.handleMidButton()}} />;  
        }
        overlayContent = <ConnectionIndicator current={this.props.gameService.numChallengeParticipants} max={this.props.sequenceService.currentSequence ? this.props.sequenceService.currentSequence.tracks.length : 0} />;
        break;
 
      case "play":
        buttonLeft = <Button type="home" text="Back" onPress={()=>{gameService.handleLeftButton()}}/>;
        secondaryScreen = <SecondaryScreen type="instrument" instrument={instrumentName} />;
        if(!(this.props.gameService.activeWalk.tutorial && this.props.gameService.pathIndex == 0)) {
          buttonMid= <Button type="change" onPress={()=>{gameService.handleMidButton()}} />;
        }
        break;
    }

    return (
      <View>
        <ScreenContainer
          primaryScreen = {<PrimaryScreen
              backgroundColor={this.props.peakService.isUp ? "passive" : "active" }
              // backgroundFlow
              mainContent = { mainContent }
              overlayContent = { overlayContent }
              scrollContent = { scrollContent }
              infoStreamContent = { this.props.gameService.infoStream.length ? <InfoStream/> : null }
            />}
          secondaryScreen = {secondaryScreen}
          buttonRight = {buttonRight}
          buttonMid = {buttonMid}
          buttonLeft = {buttonLeft}
          statusBar = {statusBar}
          modalContent = {modalContent}      
          buttonModal = {buttonModal}    
        />

      </View>
    );
  }
}

export default withPeakService(withNearbyService(withGameService(withSequenceService(GameContainer))));
