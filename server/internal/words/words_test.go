package words

import (
	"reflect"
	"testing"
)

var fw = string(rune(0x3000)) // full-width space

func TestSplit(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want []string
	}{
		{"half-width", "猫 ピアノ", []string{"猫", "ピアノ"}},
		{"full-width", "猫" + fw + "ピアノ", []string{"猫", "ピアノ"}},
		{"mixed and repeated", "  猫 " + fw + " ピアノ" + fw, []string{"猫", "ピアノ"}},
		{"upper case", "Cat PIANO", []string{"cat", "piano"}},
		{"full-width latin", "ＣＡＴ ｐｉａｎｏ", []string{"cat", "piano"}},
		{"half-width kana to full-width", "ﾋﾟｱﾉ", []string{"ピアノ"}},
		{"blank", "  " + fw, []string{}},
		{"empty", "", []string{}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Split(tt.in)
			if len(got) == 0 && len(tt.want) == 0 {
				return
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("Split(%q) = %q, want %q", tt.in, got, tt.want)
			}
		})
	}
}

func TestKeyIgnoresOrderCaseWidth(t *testing.T) {
	a := Key("猫 Piano")
	b := Key("ＰＩＡＮＯ" + fw + "猫")
	c := Key("piano 猫 piano")
	if a != b || a != c {
		t.Fatalf("keys differ: %q %q %q", a, b, c)
	}
	if Key("猫") == Key("猫 犬") {
		t.Fatal("different sets must differ")
	}
}

func TestContainsAll(t *testing.T) {
	ws := Split("猫 piano")
	tests := []struct {
		title string
		want  bool
	}{
		{"猫がＰｉａｎｏを弾く", true},
		{"PIANO と 猫", true},
		{"猫だけ", false},
		{"piano only", false},
	}
	for _, tt := range tests {
		if got := ContainsAll(tt.title, ws); got != tt.want {
			t.Errorf("ContainsAll(%q) = %v, want %v", tt.title, got, tt.want)
		}
	}
}
