// This module is used only by the isolated test bundle, never by the website.
export const isSupabaseConfigured = true;
const state = globalThis.__CINEVEA_TEST__;
const query = (table) => {
  const chain = {
    select: () => chain,
    order: () => chain,
    eq: () => chain,
    in: () => chain,
    gt: () => chain,
    then: (resolve, reject) =>
      Promise.resolve({ data: state.tables[table] ?? [], error: null }).then(
        resolve,
        reject,
      ),
  };
  return chain;
};
let listener;
export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: state.session } }),
    onAuthStateChange: (fn) => {
      listener = fn;
      return {
        data: {
          subscription: {
            unsubscribe() {
              listener = undefined;
            },
          },
        },
      };
    },
    signInWithPassword: async () => {
      if (state.authError) return { error: { message: state.authError } };
      state.session = {
        access_token: "test-only",
        user: { id: "test-user", email: "student@example.test" },
      };
      listener?.("SIGNED_IN", state.session);
      return { error: null };
    },
    signUp: async () => ({ data: { session: null }, error: null }),
    signOut: async () => {
      state.session = null;
      listener?.("SIGNED_OUT", null);
    },
  },
  from: query,
  rpc: async (name, args) => {
    state.calls.push({ name, args });
    await new Promise((resolve) => setTimeout(resolve, 25));
    if (name === "reserve_showtime_seats")
      return state.failHold
        ? { error: { message: "Seat A1 is no longer available" }, data: null }
        : {
            error: null,
            data: {
              hold_token: "test-hold",
              expires_at: new Date(Date.now() + 300000).toISOString(),
            },
          };
    if (name === "confirm_held_booking")
      return state.failConfirm
        ? { error: { message: "Seat hold has expired" }, data: null }
        : { error: null, data: { booking_ref: args.p_booking_ref } };
    return { error: null, data: null };
  },
  functions: {
    invoke: async () => ({
      data: null,
      error: new Error("AI unavailable in test"),
    }),
  },
};
