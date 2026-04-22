// 1D Kalman filter for smoothing a noisy scalar signal (e.g., cursor x or y)
export class KalmanFilter {
  private estimate: number
  private errorCovariance: number
  private readonly processNoise: number
  private measurementNoise: number

  constructor(initialEstimate = 0, processNoise = 0.01, measurementNoise = 0.1) {
    this.estimate = initialEstimate
    this.errorCovariance = 1
    this.processNoise = processNoise
    this.measurementNoise = measurementNoise
  }

  update(measurement: number): number {
    // Predict step
    const predictedError = this.errorCovariance + this.processNoise

    // Update step
    const kalmanGain = predictedError / (predictedError + this.measurementNoise)
    this.estimate = this.estimate + kalmanGain * (measurement - this.estimate)
    this.errorCovariance = (1 - kalmanGain) * predictedError

    return this.estimate
  }

  setMeasurementNoise(r: number) {
    this.measurementNoise = r
  }

  reset(value: number) {
    this.estimate = value
    this.errorCovariance = 1
  }
}

// 2D Kalman filter wrapping two 1D filters (x and y)
export class KalmanFilter2D {
  private kx: KalmanFilter
  private ky: KalmanFilter

  constructor(processNoise = 0.01, measurementNoise = 0.1) {
    this.kx = new KalmanFilter(0, processNoise, measurementNoise)
    this.ky = new KalmanFilter(0, processNoise, measurementNoise)
  }

  update(x: number, y: number): { x: number; y: number } {
    return { x: this.kx.update(x), y: this.ky.update(y) }
  }

  setMeasurementNoise(r: number) {
    this.kx.setMeasurementNoise(r)
    this.ky.setMeasurementNoise(r)
  }

  reset(x: number, y: number) {
    this.kx.reset(x)
    this.ky.reset(y)
  }
}
