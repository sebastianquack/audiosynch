const exec = require('await-exec')
const Timeout = require('await-timeout');

async function cut(cues, beats, filePath, outputDir, filePrefix, cutStartOffsetMs=0, cutEndOffsetMs=0, sequenceStartOffsetMs=0) {
  console.log(filePath)
  for (let cue of cues) {
    
    const startBeat = beats.find( b => b.bar == cue.start.bar && b.barBeat == cue.start.barBeat)
    if (!startBeat) {
      console.warn(`cue ${cue.start.bar}.${cue.start.barBeat} not found`)
      continue
    }
    let startMs = startBeat.absTimeMs + cutStartOffsetMs
    if ( startMs < 0) { // cutStartOffset
      startMs = 0
    }

    const endBeat = beats.find( b => b.bar == cue.end.bar && b.barBeat == cue.end.barBeat)
    if (!endBeat) {
      console.log(`cue ${cue.end.bar}.${cue.end.barBeat} not found`)
      continue
    }
    const endMs = endBeat.absTimeMs

    const lengthMs = endMs - startMs

    //console.log(startMs, lengthMs)

    const outputFilename = `${filePrefix}${cue.start.bar}.${cue.start.barBeat}-${cue.end.bar}.${cue.end.barBeat}_@${Math.round(startMs+sequenceStartOffsetMs-cutStartOffsetMs)}.mp3`
    const outputPath = outputDir + '/' + outputFilename
    const command = `ffmpeg -ss ${(startMs/1000).toFixed(3)} -t ${(lengthMs/1000).toFixed(3)} -i "${filePath}" "${outputPath}"`
    console.log(command)
    //try {
      await exec(command)
      //await Timeout.set(2000)
      //console.log(result)
      //return result
    //} catch(error) {
      //console.warn(" FFMPEG ERROR", JSON.stringify(error))
      //return false
    //}
  }
  
  // console.log("generating " + outputDir + '/' + outputFilename)
}

// ffmpeg -ss 10 -t 6.5 -i 01PNO.wav out.wav

module.exports = { cut }