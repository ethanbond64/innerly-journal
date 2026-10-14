package journal

import "strings"

func countWords(value string) int { return len(strings.Fields(value)) }

func getSentiment(value string) string {
	positiveCount, negativeCount, skip := 0, 0, 0
	for _, token := range strings.Fields(strings.ToLower(strings.ReplaceAll(value, "'", ""))) {
		if negations[token] {
			skip = 2
			continue
		}
		if skip > 0 {
			skip--
			continue
		}
		if positive[token] {
			positiveCount++
		}
		if negative[token] {
			negativeCount++
		}
	}
	if positiveCount == 0 && negativeCount == 0 {
		return "neutral"
	}
	if positiveCount == 0 {
		return "negative"
	}
	if negativeCount == 0 {
		return "positive"
	}
	ratio := float64(negativeCount) / float64(positiveCount)
	if ratio > 1.1 {
		return "negative"
	}
	if ratio < 0.5 {
		return "positive"
	}
	return "neutral"
}

func processTextEntry(input map[string]any) map[string]any {
	value := text(input["text"])
	return map[string]any{"title": input["title"], "text": value, "word_count": countWords(value), "sentiment": getSentiment(value)}
}

func sentimentIndexToValue(index int) string {
	if index == 0 {
		return "negative"
	}
	if index == 2 {
		return "positive"
	}
	return "neutral"
}
