import { useCallback, useEffect, useRef, useState } from "react";
import { Header } from "@/components/Header";
import { ProgressBar } from "@/components/ProgressBar";
import { Avatar } from "@/components/Avatar";
import { ChatTranscript } from "@/components/ChatTranscript";
import { VoiceInput } from "@/components/VoiceInput";
import { MovieGrid } from "@/components/MovieGrid";
import { DateShowtimePanel } from "@/components/DateShowtimePanel";
import { SeatMap } from "@/components/SeatMap";
import { BookingSummary, Confirmation } from "@/components/BookingSummary";
import { Landing } from "@/components/Landing";
import { AuthScreen } from "@/components/AuthScreen";
import { useAuth } from "@/hooks/useAuth";
import { useBooking } from "@/hooks/useBooking";
import { speechController } from "@/lib/speech";
import {
  aiRespond,
  ruleBasedRespond,
  type ChatMessage,
  type AssistantResponse,
} from "@/lib/conversation";
import { isAIEnabled } from "@/config";
import { supabase } from "@/lib/supabase";
import { Info, Loader2 } from "lucide-react";

let msgId = 0;
function newId(): string {
  msgId += 1;
  return `msg-${msgId}`;
}

function App() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
      </div>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  return <CineveaApp />;
}

function CineveaApp() {
  const booking = useBooking();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [ttsEnabled, setTtsEnabled] = useState(true);
  const [bookingId, setBookingId] = useState("");
  const [showInfo, setShowInfo] = useState(false);
  const thinkingRef = useRef(false);
  const greetingSent = useRef(false);
  const hasInteracted = useRef(false);

  const speak = useCallback(
    (text: string) => {
      if (!ttsEnabled) return;
      // Don't auto-speak until the user has interacted with the page at least once.
      // Browsers can block audio before a user gesture, and TTS interferes with
      // speech recognition startup if it hasn't fully settled.
      if (!hasInteracted.current) return;
      setIsSpeaking(true);
      speechController.speak(text, () => {
        setIsSpeaking(false);
      });
    },
    [ttsEnabled]
  );

  // Send greeting on first load (text only — voice kicks in after first interaction)
  useEffect(() => {
    if (greetingSent.current) return;
    greetingSent.current = true;
    const msg: ChatMessage = {
      id: newId(),
      role: "assistant",
      text: "Welcome to Cinevea! I'm your movie booking assistant. I can help you book tickets by voice or text. Tap the microphone to speak, or type your message below. To get started, would you like to see what movies are showing?",
      timestamp: Date.now(),
    };
    setMessages([msg]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addAssistantMessage = useCallback(
    (response: AssistantResponse) => {
      const msg: ChatMessage = {
        id: newId(),
        role: "assistant",
        text: response.text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, msg]);
      speak(response.text);

      if (response.action) {
        const action = response.action;
        setTimeout(() => {
          if (action.type === "confirm_booking") {
            setBookingId("CV-" + Date.now().toString(36).toUpperCase().slice(-8));
          }
          booking.applyAction(action);
        }, 600);
      }
    },
    [speak, booking]
  );

  const handleSendMessage = useCallback(
    async (text: string) => {
      hasInteracted.current = true;
      const userMsg: ChatMessage = {
        id: newId(),
        role: "user",
        text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);

      speechController.stopSpeaking();
      setIsSpeaking(false);

      setIsThinking(true);
      thinkingRef.current = true;

      try {
        let response: AssistantResponse;
        if (isAIEnabled()) {
          response = await aiRespond(text, booking.state, messages);
        } else {
          await new Promise((r) => setTimeout(r, 400));
          response = ruleBasedRespond(text, booking.state);
        }
        setIsThinking(false);
        thinkingRef.current = false;
        addAssistantMessage(response);
      } catch {
        setIsThinking(false);
        thinkingRef.current = false;
        const fallback = ruleBasedRespond(text, booking.state);
        addAssistantMessage(fallback);
      }
    },
    [booking, messages, addAssistantMessage]
  );

  const handleToggleTts = useCallback(() => {
    setTtsEnabled((prev) => {
      const next = !prev;
      if (!next) {
        speechController.stopSpeaking();
        setIsSpeaking(false);
      }
      return next;
    });
  }, []);

  const handleRestart = useCallback(() => {
    booking.reset();
    setMessages([]);
    setBookingId("");
    speechController.stopSpeaking();
    setIsSpeaking(false);
    greetingSent.current = false;
    hasInteracted.current = true; // already interacted if they hit restart
    setTimeout(() => {
      greetingSent.current = true;
      const msg: ChatMessage = {
        id: newId(),
        role: "assistant",
        text: "Let's start fresh! Which movie would you like to see? You can browse the options on the right and tap one, or just tell me the title or genre.",
        timestamp: Date.now(),
      };
      setMessages([msg]);
      if (ttsEnabled) speak(msg.text);
    }, 100);
  }, [booking, ttsEnabled, speak]);

  const handleManualMovieSelect = useCallback(
    (movie: NonNullable<typeof booking.state.movie>) => {
      if (!movie) return;
      hasInteracted.current = true;
      booking.manualSelectMovie(movie);
      const text = `Great choice! ${movie.title} — ${movie.genre}, rated ${movie.rating}, ${movie.duration} minutes. What day would you like to see it?`;
      const msg: ChatMessage = {
        id: newId(),
        role: "assistant",
        text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, msg]);
      speak(text);
    },
    [booking, speak]
  );

  const handleManualDateSelect = useCallback(
    (date: string) => {
      hasInteracted.current = true;
      booking.manualSelectDate(date);
      if (booking.state.movie) {
        const text = `Got it. Here are the showtimes for ${booking.state.movie.title}: ${booking.state.movie.showtimes.join(", ")}. Which time works for you?`;
        const msg: ChatMessage = {
          id: newId(),
          role: "assistant",
          text,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, msg]);
        speak(text);
      }
    },
    [booking, speak]
  );

  const handleManualShowtimeSelect = useCallback(
    (showtime: string) => {
      hasInteracted.current = true;
      booking.manualSelectShowtime(showtime);
      const text = `Got it — ${showtime}. How many tickets would you like? You can book up to 10.`;
      const msg: ChatMessage = {
        id: newId(),
        role: "assistant",
        text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, msg]);
      speak(text);
    },
    [booking, speak]
  );

  const handleConfirmSeats = useCallback(() => {
    booking.confirmSeatsFromMap();
    const seats = booking.state.seats.map((s) => `${s.row}${s.col}`).join(", ");
    const text = `Seats ${seats} — perfect! Here's your booking summary. Would you like to confirm, or would you like to change anything?`;
    const msg: ChatMessage = {
      id: newId(),
      role: "assistant",
      text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
    speak(text);
  }, [booking, speak]);

  const handleConfirmBooking = useCallback(() => {
    const ref = "CV-" + Date.now().toString(36).toUpperCase().slice(-8);
    setBookingId(ref);
    booking.applyAction({ type: "confirm_booking" });

    // Persist booking to Supabase
    const { state: bs } = booking;
    if (bs.movie && bs.date && bs.showtime) {
      supabase
        .from("bookings")
        .insert({
          booking_ref: ref,
          movie_title: bs.movie.title,
          movie_genre: bs.movie.genre,
          movie_rating: bs.movie.rating,
          show_date: bs.date,
          showtime: bs.showtime,
          ticket_count: bs.ticketCount,
          seats: bs.seats.map((s) => `${s.row}${s.col}`),
          total_price: bs.ticketCount * 14.99,
        })
        .then(({ error }) => {
          if (error) console.error("Failed to save booking:", error.message);
        });
    }

    const text = "Wonderful! Your booking is confirmed. Enjoy the show! Would you like to book another movie?";
    const msg: ChatMessage = {
      id: newId(),
      role: "assistant",
      text,
      timestamp: Date.now(),
    };
    setMessages((prev) => [...prev, msg]);
    speak(text);
  }, [booking, speak]);

  const handleEditStep = useCallback(
    (step: "movie" | "date" | "showtime" | "tickets" | "seats") => {
      const stepOrder = ["greeting", "movie", "date", "showtime", "tickets", "seats", "review", "confirmed"];
      const targetIdx = stepOrder.indexOf(step);
      const currentIdx = stepOrder.indexOf(booking.state.step);
      const goBackCount = currentIdx - targetIdx;
      for (let i = 0; i < goBackCount; i++) {
        booking.goBack();
      }
      const text =
        step === "movie"
          ? "Sure, which movie would you like instead?"
          : step === "date"
          ? "No problem — which date works better?"
          : step === "showtime"
          ? "Which showtime would you prefer?"
          : step === "tickets"
          ? "How many tickets would you like?"
          : "Which seats would you like instead?";
      const msg: ChatMessage = {
        id: newId(),
        role: "assistant",
        text,
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, msg]);
      speak(text);
    },
    [booking, speak]
  );

  const { state } = booking;

  const renderPanel = () => {
    switch (state.step) {
      case "greeting":
        return <Landing onSelectMovie={handleManualMovieSelect} />;
      case "movie":
        return (
          <MovieGrid
            selectedMovieId={state.movie?.id || null}
            onSelect={handleManualMovieSelect}
          />
        );
      case "date":
      case "showtime":
        return state.movie ? (
          <DateShowtimePanel
            movie={state.movie}
            selectedDate={state.date}
            selectedShowtime={state.showtime}
            onSelectDate={handleManualDateSelect}
            onSelectShowtime={handleManualShowtimeSelect}
          />
        ) : null;
      case "tickets":
        return (
          <div className="p-4">
            <h2 className="text-sm font-semibold text-slate-400 mb-3">
              How many tickets?
            </h2>
            <div className="grid grid-cols-5 gap-2">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => {
                    booking.manualSetTickets(n);
                    const text = `${n} ticket${n > 1 ? "s" : ""} — got it! Now let's pick your seats. The theater has rows A through H. You can say seat numbers like "A5" or "B3 and B4", or tap seats on the map.`;
                    const msg: ChatMessage = {
                      id: newId(),
                      role: "assistant",
                      text,
                      timestamp: Date.now(),
                    };
                    setMessages((prev) => [...prev, msg]);
                    speak(text);
                  }}
                  className="py-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-lg transition-all hover:scale-105"
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        );
      case "seats":
        return (
          <SeatMap
            occupiedSeats={booking.occupiedSeats}
            selectedSeats={state.seats}
            ticketCount={state.ticketCount}
            onToggleSeat={booking.toggleSeat}
            onConfirm={handleConfirmSeats}
          />
        );
      case "review":
        return (
          <BookingSummary
            booking={state}
            onConfirm={handleConfirmBooking}
            onEdit={handleEditStep}
          />
        );
      case "confirmed":
        return (
          <Confirmation
            booking={state}
            bookingId={bookingId}
            onRestart={handleRestart}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="h-screen flex flex-col bg-slate-950 overflow-hidden">
      <Header onRestart={handleRestart} />
      <ProgressBar currentStep={state.step} />

      {!isAIEnabled() && (
        <div className="px-4 py-1.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center gap-2 text-xs text-amber-400">
          <Info className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="truncate">
            Running in offline mode. Add your OpenAI API key in src/config.ts to enable AI-powered conversation.
          </span>
          <button
            onClick={() => setShowInfo(!showInfo)}
            className="ml-auto text-amber-400 hover:text-amber-300 underline flex-shrink-0"
          >
            {showInfo ? "Hide" : "How?"}
          </button>
        </div>
      )}
      {showInfo && !isAIEnabled() && (
        <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 text-xs text-slate-400">
          Open <code className="text-cyan-400 bg-slate-800 px-1 rounded">src/config.ts</code> and paste your OpenAI API key into the <code className="text-cyan-400 bg-slate-800 px-1 rounded">OPENAI_API_KEY</code> variable. Get a key from platform.openai.com/api-keys. The app works fully without it using the built-in conversation engine.
        </div>
      )}

      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Chat panel */}
        <div className="flex-1 flex flex-col min-h-0 lg:max-w-[440px] border-r border-slate-800">
          {/* Avatar + status */}
          <div className="flex-shrink-0 pt-4 pb-2 bg-slate-900/50">
            <Avatar
              isSpeaking={isSpeaking}
              isListening={false}
              isThinking={isThinking}
              genre={state.movie?.genre || null}
            />
          </div>

          {/* Chat transcript */}
          <ChatTranscript messages={messages} />

          {/* Input — mic is always enabled so users can interrupt the avatar */}
          <VoiceInput
            onSendMessage={handleSendMessage}
            disabled={isThinking}
            ttsEnabled={ttsEnabled}
            onToggleTts={handleToggleTts}
          />
        </div>

        {/* Visual booking panel */}
        <div className="flex-1 overflow-y-auto bg-slate-900/30">
          {renderPanel()}
        </div>
      </div>
    </div>
  );
}

export default App;
