import React from 'react';

export class Challenges extends React.Component {
  constructor() {
    super()
    this.state = {}
  }

  render () {
    return <div>
      Challenges:
      {JSON.stringify(this.props.data.challenges)}
    </div>
  }
}