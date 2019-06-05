import React from 'react';

const LanguageContext = React.createContext()

class BaseStateProvider extends React.Component {
  constructor() {
    super()
    this.navigationStates = [
      "welcome",
      "challenges",
      "challenge"
    ]
    this.languages = [
     "en",
     "de" 
    ]
    this.state = {
      navigationState: /*sessionStorage.getItem('navigationState') ||*/ "welcome",
      language: "en",
      challengeInfoOpen: true
    }

    this.handleNavigation = this.handleNavigation.bind(this)
    this.navigateToChallenge = this.navigateToChallenge.bind(this)
    this.toggleLanguage = this.toggleLanguage.bind(this)
    this.toggleChallengeInfo = this.toggleChallengeInfo.bind(this)
  }

  toggleLanguage() {
    this.setState({
      language: ( this.state.language === "en" ? "de" : "en")
    })
  }

  toggleChallengeInfo() {
    this.setState({challengeInfoOpen: !this.state.challengeInfoOpen})
  }

  handleNavigation(target) {
    if (this.navigationStates.indexOf(target) === -1 ) {
      console.warn("no route to " + target + " exists"); return;
    }
    this.setState({
      navigationState: target
    })
    if(target !== "challenge") {
      this.setState({currentChallenge: null});
    }
    // sessionStorage.setItem('navigationState', target);
  }

  navigateToChallenge(currentChallenge) {
    this.setState({currentChallenge});
    this.handleNavigation("challenge");
  }

  render () {

    const newKids = React.Children.map(this.props.children, child => {
      return React.cloneElement(child, {
        navigationState: this.state.navigationState,
        currentChallenge: this.state.currentChallenge,
        navigateTo: this.handleNavigation,
        navigateToChallenge: this.navigateToChallenge,
        language: this.state.language,
        toggleLanguage: this.toggleLanguage,
        toggleChallengeInfo: this.toggleChallengeInfo,
        challengeInfoOpen: this.state.challengeInfoOpen
      });
    });

    return <LanguageContext.Provider value={this.state.language}>
      { newKids }
    </LanguageContext.Provider>
  }
}

function withLanguage (WrappedComponent) {
  return class extends React.Component {
    render() {
      return (
        <LanguageContext.Consumer>
          {language => 
            <WrappedComponent
              language={language} {...this.props}
            />    
          }
        </LanguageContext.Consumer>
      )
    }
  }
}

export {
  BaseStateProvider,
  LanguageContext,
  withLanguage,
}