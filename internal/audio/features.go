package audio

import (
	"math"
)

const featureFFTSize = 512

// PartyFeatures holds normalized audio analysis values for party mode.
type PartyFeatures struct {
	Level  float64
	Bass   float64
	Mid    float64
	Treble float64
	Beat   float64
}

func clampUnit(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}

// ExtractPartyFeatures analyzes mono PCM S16 samples and returns normalized features.
func ExtractPartyFeatures(samples []int16) PartyFeatures {
	if len(samples) == 0 {
		return PartyFeatures{}
	}

	var levelSum float64
	for _, sample := range samples {
		centered := float64(sample) / 32768.0
		levelSum += centered * centered
	}
	rms := math.Sqrt(levelSum / float64(len(samples)))

	magnitudes := magnitudeSpectrum(samples)
	bassEnd := max(1, len(magnitudes)*15/100)
	midEnd := max(bassEnd+1, len(magnitudes)*55/100)

	var bass, mid, treble float64
	for i, mag := range magnitudes {
		normalized := mag / 255.0
		switch {
		case i < bassEnd:
			bass += normalized
		case i < midEnd:
			mid += normalized
		default:
			treble += normalized
		}
	}
	bass /= float64(max(1, bassEnd))
	mid /= float64(max(1, midEnd-bassEnd))
	treble /= float64(max(1, len(magnitudes)-midEnd))

	beat := clampUnit(bass*0.65 + rms*0.35)
	return PartyFeatures{
		Level:  clampUnit(rms * 1.6),
		Bass:   clampUnit(bass),
		Mid:    clampUnit(mid),
		Treble: clampUnit(treble),
		Beat:   beat,
	}
}

func magnitudeSpectrum(samples []int16) []float64 {
	windowed := make([]float64, featureFFTSize)
	n := min(len(samples), featureFFTSize)
	for i := 0; i < n; i++ {
		hann := 0.5 * (1 - math.Cos(2*math.Pi*float64(i)/float64(max(1, n-1))))
		windowed[i] = (float64(samples[i]) / 32768.0) * hann
	}

	real := make([]float64, featureFFTSize)
	imag := make([]float64, featureFFTSize)
	copy(real, windowed)
	fftInPlace(real, imag)

	half := featureFFTSize / 2
	out := make([]float64, half)
	for i := 0; i < half; i++ {
		mag := math.Hypot(real[i], imag[i])
		if mag > 255 {
			mag = 255
		}
		out[i] = mag
	}
	return out
}

func fftInPlace(real, imag []float64) {
	n := len(real)
	if n <= 1 {
		return
	}

	j := 0
	for i := 1; i < n; i++ {
		bit := n >> 1
		for j&bit != 0 {
			bit >>= 1
			j ^= bit
		}
		j ^= bit
		if i < j {
			real[i], real[j] = real[j], real[i]
			imag[i], imag[j] = imag[j], imag[i]
		}
	}

	for length := 2; length <= n; length <<= 1 {
		angle := -2 * math.Pi / float64(length)
		wReal := math.Cos(angle)
		wImag := math.Sin(angle)
		for i := 0; i < n; i += length {
			curReal := 1.0
			curImag := 0.0
			for k := 0; k < length/2; k++ {
				uReal := real[i+k]
				uImag := imag[i+k]
				vReal := real[i+k+length/2]*curReal - imag[i+k+length/2]*curImag
				vImag := real[i+k+length/2]*curImag + imag[i+k+length/2]*curReal
				real[i+k] = uReal + vReal
				imag[i+k] = uImag + vImag
				real[i+k+length/2] = uReal - vReal
				imag[i+k+length/2] = uImag - vImag
				nextReal := curReal*wReal - curImag*wImag
				curImag = curReal*wImag + curImag*wReal
				curReal = nextReal
			}
		}
	}
}
