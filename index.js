import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, onSnapshot, query, serverTimestamp, updateDoc, orderBy } from 'firebase/firestore';
import { Plus, Trash2, BarChart2, Edit, Send, Share2, Eye, Star, ChevronUp, ChevronDown, Lock, Unlock, CheckCircle } from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
    apiKey: "YOUR_API_KEY",
    authDomain: "YOUR_AUTH_DOMAIN",
    projectId: "YOUR_PROJECT_ID",
    storageBucket: "YOUR_STORAGE_BUCKET",
    messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
    appId: "YOUR_APP_ID"
};

// --- App ID Configuration ---
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-forms-app';

// --- Main App Component ---
export default function App() {
    const [page, setPage] = useState({ currentPage: 'home', formId: null, mode: 'view' });
    const [auth, setAuth] = useState(null);
    const [db, setDb] = useState(null);
    const [user, setUser] = useState(null);
    const [isAuthReady, setIsAuthReady] = useState(false);

    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            const authInstance = getAuth(app);
            const dbInstance = getFirestore(app);
            setAuth(authInstance);
            setDb(dbInstance);

            const unsubscribe = onAuthStateChanged(authInstance, async (currentUser) => {
                if (currentUser) {
                    setUser(currentUser);
                } else {
                    try {
                        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
                            await signInWithCustomToken(authInstance, __initial_auth_token);
                        } else {
                            await signInAnonymously(authInstance);
                        }
                    } catch (error) {
                        console.error("Error during sign-in:", error);
                    }
                }
                setIsAuthReady(true);
            });
            return () => unsubscribe();
        } catch (error) {
            console.error("Firebase initialization error:", error);
        }
    }, []);
    
    const navigate = (newPage, formId = null, mode = 'view') => {
        setPage({ currentPage: newPage, formId, mode });
    };

    if (!isAuthReady || !db || !auth) {
        return <div className="flex items-center justify-center h-screen bg-gray-100"><div className="text-xl font-semibold">Loading...</div></div>;
    }

    const renderPage = () => {
        const props = { db, user, navigate, formId: page.formId, mode: page.mode };
        switch (page.currentPage) {
            case 'builder': return <FormBuilder {...props} />;
            case 'viewer': return <FormViewer {...props} />;
            case 'summary': return <ResponseSummary {...props} />;
            case 'home': default: return <HomePage {...props} />;
        }
    };

    return (
        <div className="bg-gray-50 min-h-screen font-sans">
            <div className="container mx-auto p-4 sm:p-6 lg:p-8">
                {renderPage()}
            </div>
        </div>
    );
}

// --- Home Page Component ---
function HomePage({ db, user, navigate }) {
    const [forms, setForms] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) return;
        const formsPath = `/artifacts/${appId}/users/${user.uid}/forms`;
        const q = query(collection(db, formsPath));
        
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const formsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setForms(formsData);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [db, user]);

    const createNewForm = async () => {
        if (!user) return;
        const formsPath = `/artifacts/${appId}/users/${user.uid}/forms`;
        const newFormRef = await addDoc(collection(db, formsPath), {
            title: 'Untitled Poll',
            description: '',
            questions: [],
            authorId: user.uid,
            createdAt: serverTimestamp(),
            status: 'draft'
        });
        navigate('builder', newFormRef.id);
    };

    return (
        <div className="max-w-4xl mx-auto">
            <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8">
                <h1 className="text-3xl font-bold text-gray-800 mb-4 sm:mb-0">My Polls</h1>
                <button onClick={createNewForm} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition-colors duration-200">
                    <Plus size={20} /><span>Create New Poll</span>
                </button>
            </header>
            {loading ? <p>Loading polls...</p> : forms.length === 0 ? (
                <div className="text-center py-16 px-6 bg-white rounded-lg shadow-sm">
                    <h2 className="text-xl font-semibold text-gray-700">No polls yet!</h2>
                    <p className="text-gray-500 mt-2">Click "Create New Poll" to get started.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {forms.map(form => (
                        <div key={form.id} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <h2 className="font-semibold text-lg text-gray-800 flex-grow">{form.title}</h2>
                            <div className="flex items-center gap-2 flex-shrink-0">
                                <StatusPill status={form.status} />
                                <button onClick={() => navigate('summary', form.id)} className="text-sm flex items-center gap-1 text-gray-600 hover:text-blue-600"><BarChart2 size={16} /> Responses</button>
                                <button onClick={() => navigate('builder', form.id)} className="text-sm flex items-center gap-1 text-gray-600 hover:text-blue-600"><Edit size={16} /> Edit</button>
                                <button onClick={() => navigate('viewer', form.id, 'respond')} className="text-sm flex items-center gap-1 text-gray-600 hover:text-blue-600"><Eye size={16} /> Preview</button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// --- Form Builder Component ---
function FormBuilder({ db, user, navigate, formId }) {
    const [form, setForm] = useState(null);
    const [loading, setLoading] = useState(true);
    const debounceTimeout = useRef(null);
    const formDocPath = `/artifacts/${appId}/users/${user.uid}/forms/${formId}`;

    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, formDocPath), (docSnap) => {
            if (docSnap.exists()) setForm({ id: docSnap.id, ...docSnap.data() });
            else { console.error("Form not found!"); navigate('home'); }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [db, formId, navigate, user.uid, formDocPath]);

    const updateFirestore = (updatedForm) => {
        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        debounceTimeout.current = setTimeout(async () => {
            try { await setDoc(doc(db, formDocPath), updatedForm, { merge: true }); }
            catch (error) { console.error("Error updating form:", error); }
        }, 500);
    };

    const handleFormChange = (field, value) => {
        const updatedForm = { ...form, [field]: value };
        setForm(updatedForm);
        updateFirestore(updatedForm);
    };

    const handleQuestionChange = (index, field, value) => {
        const newQuestions = [...form.questions];
        newQuestions[index] = { ...newQuestions[index], [field]: value };
        handleFormChange('questions', newQuestions);
    };

    const addQuestion = (type) => {
        let newQuestion = { id: crypto.randomUUID(), text: '', type: type, required: false };
        if (type === 'rating-poll') {
            newQuestion.options = [];
        }
        handleFormChange('questions', [...form.questions, newQuestion]);
    };

    const deleteQuestion = (index) => handleFormChange('questions', form.questions.filter((_, i) => i !== index));

    const handleOptionChange = (qIndex, oIndex, field, value) => {
        const newQuestions = [...form.questions];
        newQuestions[qIndex].options[oIndex][field] = value;
        handleFormChange('questions', newQuestions);
    };


    const addOption = (qIndex) => {
        const newQuestions = [...form.questions];
        newQuestions[qIndex].options.push({ id: crypto.randomUUID(), text: `New Option`, imageUrl: '', ratings: {}, avgRating: 0, ratingCount: 0, creatorId: user.uid });
        handleFormChange('questions', newQuestions);
    };

    const deleteOption = (qIndex, oIndex) => {
        const newQuestions = [...form.questions];
        newQuestions[qIndex].options = newQuestions[qIndex].options.filter((_, i) => i !== oIndex);
        handleFormChange('questions', newQuestions);
    };

    const reorderOption = (qIndex, oIndex, direction) => {
        const newQuestions = [...form.questions];
        const options = newQuestions[qIndex].options;
        const newIndex = oIndex + direction;
        if (newIndex < 0 || newIndex >= options.length) return;
        [options[oIndex], options[newIndex]] = [options[newIndex], options[oIndex]];
        handleFormChange('questions', newQuestions);
    };
    
    const [showShareModal, setShowShareModal] = useState(false);

    if (loading || !form) return <div className="text-center p-10">Loading form builder...</div>;

    const shareableLink = `${window.location.origin}${window.location.pathname}?page=viewer&formId=${form.id}&authorId=${user.uid}&mode=respond`;

    return (
        <div className="max-w-3xl mx-auto">
            <header className="flex justify-between items-center mb-6">
                <button onClick={() => navigate('home')} className="text-blue-600 hover:underline">← Back to Polls</button>
                <div className="flex gap-2">
                    <button onClick={() => navigate('summary', form.id)} className="px-4 py-2 text-sm bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Responses</button>
                    <button onClick={() => setShowShareModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700"><Share2 size={18} /> Share</button>
                </div>
            </header>

            <div className="bg-white p-6 sm:p-8 rounded-lg shadow-md border-t-8 border-blue-600">
                <input type="text" value={form.title} onChange={(e) => handleFormChange('title', e.target.value)} placeholder="Poll Title" className="text-3xl font-bold w-full border-b-2 border-gray-200 focus:border-blue-500 outline-none pb-2 mb-4" />
                <input type="text" value={form.description} onChange={(e) => handleFormChange('description', e.target.value)} placeholder="Poll description" className="w-full border-b border-gray-200 focus:border-blue-500 outline-none pb-2 mb-4 text-gray-600" />
                <div className="flex items-center gap-2">
                    <label className="font-semibold text-gray-700">Status:</label>
                    <select value={form.status} onChange={e => handleFormChange('status', e.target.value)} className="p-2 border border-gray-300 rounded-md">
                        <option value="draft">Draft</option>
                        <option value="published">Published</option>
                        <option value="closed">Closed</option>
                    </select>
                </div>
            </div>

            <div className="space-y-6 mt-6">
                {form.questions.map((q, qIndex) => (
                    <div key={q.id} className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
                        <div className="flex justify-between items-start gap-4">
                            <input type="text" value={q.text} onChange={(e) => handleQuestionChange(qIndex, 'text', e.target.value)} placeholder="Question" className="text-lg font-semibold w-full border-b border-gray-200 focus:border-blue-500 outline-none pb-2" />
                            <button onClick={() => deleteQuestion(qIndex)} className="text-gray-500 hover:text-red-600"><Trash2 size={20} /></button>
                        </div>
                        {q.type === 'rating-poll' && (
                            <div className="mt-4 space-y-3">
                                <h3 className="text-md font-semibold text-gray-700">Options</h3>
                                {q.options.map((opt, oIndex) => (
                                    <div key={opt.id} className="flex items-center gap-2 bg-gray-50 p-2 rounded-md">
                                        <div className="flex flex-col gap-2">
                                            <button onClick={() => reorderOption(qIndex, oIndex, -1)} disabled={oIndex === 0} className="disabled:opacity-25"><ChevronUp size={16}/></button>
                                            <button onClick={() => reorderOption(qIndex, oIndex, 1)} disabled={oIndex === q.options.length - 1} className="disabled:opacity-25"><ChevronDown size={16}/></button>
                                        </div>
                                        <input type="text" value={opt.text} onChange={e => handleOptionChange(qIndex, oIndex, 'text', e.target.value)} placeholder="Option text" className="flex-grow p-1 border-b outline-none" />
                                        <input type="text" value={opt.imageUrl} onChange={e => handleOptionChange(qIndex, oIndex, 'imageUrl', e.target.value)} placeholder="Image URL (optional)" className="w-1/3 p-1 border-b outline-none" />
                                        <button onClick={() => deleteOption(qIndex, oIndex)} className="text-gray-400 hover:text-red-500"><Trash2 size={16} /></button>
                                    </div>
                                ))}
                                <button onClick={() => addOption(qIndex)} className="text-sm text-blue-600 hover:underline mt-2">Add an option</button>
                            </div>
                        )}
                    </div>
                ))}
            </div>

            <div className="mt-6 p-4 bg-white rounded-lg shadow-md flex items-center justify-center gap-4">
                <span className="text-gray-600 font-semibold">Add Question:</span>
                <button onClick={() => addQuestion('rating-poll')} className="flex items-center gap-2 px-3 py-2 text-sm bg-indigo-100 hover:bg-indigo-200 rounded-md text-indigo-800"><Star size={16} /> Rating Poll</button>
            </div>
            
            {showShareModal && <ShareModal link={shareableLink} onClose={() => setShowShareModal(false)} />}
        </div>
    );
}

// --- Form Viewer/Responder Component ---
function FormViewer({ db, user, navigate, formId: propFormId }) {
    const [form, setForm] = useState(null);
    const [comments, setComments] = useState([]);
    const [newComment, setNewComment] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [newOptionText, setNewOptionText] = useState("");
    
    const urlParams = new URLSearchParams(window.location.search);
    const urlFormId = urlParams.get('formId');
    const urlAuthorId = urlParams.get('authorId');

    const formId = urlFormId || propFormId;
    const authorId = urlAuthorId || (form ? form.authorId : (user ? user.uid : null));

    const formDocPath = authorId && formId ? `/artifacts/${appId}/users/${authorId}/forms/${formId}` : null;
    const commentsPath = formDocPath ? `${formDocPath}/comments` : null;

    useEffect(() => {
        if (!formDocPath) {
            setError("Form link is invalid. It's missing key information.");
            setLoading(false);
            return;
        }

        setLoading(true);
        setError('');

        const unsubForm = onSnapshot(doc(db, formDocPath), (docSnap) => {
            if (docSnap.exists()) setForm({ id: docSnap.id, ...docSnap.data() });
            else setError("Poll not found or you don't have permission to view it.");
            setLoading(false);
        });

        const q = query(collection(db, commentsPath), orderBy("createdAt", "asc"));
        const unsubComments = onSnapshot(q, (querySnapshot) => {
            setComments(querySnapshot.docs.map(doc => ({id: doc.id, ...doc.data()})));
        });

        return () => {
            unsubForm();
            unsubComments();
        };
    }, [db, formDocPath, commentsPath]);

    const handleSetRating = async (qIndex, optionId, rating) => {
        if (!formDocPath || form.status === 'closed') return;
        const newQuestions = JSON.parse(JSON.stringify(form.questions));
        const question = newQuestions[qIndex];
        const optionIndex = question.options.findIndex(o => o.id === optionId);
        if (optionIndex === -1) return;

        const option = question.options[optionIndex];
        option.ratings[user.uid] = rating;
        
        const ratingsArray = Object.values(option.ratings);
        option.ratingCount = ratingsArray.length;
        option.avgRating = ratingsArray.reduce((a, b) => a + b, 0) / option.ratingCount;

        await updateDoc(doc(db, formDocPath), { questions: newQuestions });
    };

    const handleAddNewOption = async (qIndex) => {
        if (!newOptionText.trim() || !formDocPath || form.status === 'closed') return;
        const newOption = {
            id: crypto.randomUUID(), text: newOptionText.trim(), imageUrl: '',
            ratings: {}, avgRating: 0, ratingCount: 0,
            creatorId: user.uid, isFlagged: false,
        };
        
        const questionToUpdate = form.questions[qIndex];
        const updatedOptions = [...questionToUpdate.options, newOption];
        const updatedQuestions = form.questions.map((q, index) => index === qIndex ? {...q, options: updatedOptions} : q);

        await updateDoc(doc(db, formDocPath), { questions: updatedQuestions });
        setNewOptionText("");
    };

    const handlePostComment = async () => {
        if (!newComment.trim() || !commentsPath || form.status === 'closed') return;
        await addDoc(collection(db, commentsPath), {
            text: newComment.trim(),
            authorId: user.uid,
            authorName: user.isAnonymous ? "Anonymous User" : (user.displayName || "User " + user.uid.substring(0, 5)),
            createdAt: serverTimestamp()
        });
        setNewComment("");
    };

    if (loading) return <div className="text-center p-10">Loading poll...</div>;
    if (error) return <div className="text-center p-10 text-red-600">{error}</div>;
    if (!form) return <div className="text-center p-10">Poll not available.</div>;
    
    let topRatedOptionId = null;
    if (form.questions[0]?.type === 'rating-poll' && form.questions[0].options?.length > 0) {
        topRatedOptionId = form.questions[0].options.reduce((p, c) => (p.avgRating > c.avgRating) ? p : c).id;
    }

    const isClosed = form.status === 'closed';

    return (
        <div className="max-w-2xl mx-auto">
            <header className="mb-6">
                <button onClick={() => navigate('home')} className="text-blue-600 hover:underline">← Back to Polls</button>
            </header>
            <div className="bg-white p-8 rounded-lg shadow-md border-t-8 border-indigo-600 space-y-8">
                <div>
                    <div className="flex justify-between items-start">
                        <h1 className="text-3xl font-bold text-gray-800">{form.title}</h1>
                        <StatusPill status={form.status} />
                    </div>
                    <p className="text-gray-600 mt-2">{form.description}</p>
                </div>
                <hr/>
                {form.questions.map((q, qIndex) => (
                    <div key={q.id}>
                        <h2 className="block text-xl font-semibold text-gray-800 mb-4">{q.text}</h2>
                        {q.type === 'rating-poll' && (
                            <div className="space-y-4">
                                {q.options.map(opt => (
                                    <div key={opt.id} className={`p-4 border rounded-lg transition-all duration-300 ${topRatedOptionId === opt.id ? 'border-amber-400 bg-amber-50 shadow-lg' : 'border-gray-200 bg-white'}`}>
                                        <div className="flex items-center gap-4">
                                            {opt.imageUrl && <img src={opt.imageUrl} alt={opt.text} className="w-24 h-24 object-cover rounded-md" onError={(e) => { e.target.style.display = 'none'; }} />}
                                            <div className="flex-grow">
                                                <h3 className="text-lg font-semibold text-gray-900">{opt.text}</h3>
                                                <StarRating rating={opt.ratings[user.uid] || 0} onRate={(rate) => handleSetRating(qIndex, opt.id, rate)} disabled={isClosed} />
                                                <p className="text-sm text-gray-500 mt-1">Average: {opt.avgRating.toFixed(2)} stars ({opt.ratingCount} votes)</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {!isClosed && <div className="pt-4 mt-4 border-t">
                                    <label className="font-semibold text-gray-700">Prefer something else? Add an option:</label>
                                    <div className="flex gap-2 mt-2">
                                        <input type="text" value={newOptionText} onChange={e => setNewOptionText(e.target.value)} placeholder="Your suggestion" className="w-full p-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500" disabled={isClosed} />
                                        <button onClick={() => handleAddNewOption(qIndex)} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700 disabled:bg-gray-400" disabled={isClosed}>Add</button>
                                    </div>
                                </div>}
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <CommentsSection comments={comments} newComment={newComment} setNewComment={setNewComment} onPost={handlePostComment} disabled={isClosed} />
        </div>
    );
}

// --- Response Summary Component ---
function ResponseSummary({ db, user, navigate, formId }) {
    const [form, setForm] = useState(null);
    const [loading, setLoading] = useState(true);
    const formDocPath = `/artifacts/${appId}/users/${user.uid}/forms/${formId}`;

    useEffect(() => {
        const unsubscribe = onSnapshot(doc(db, formDocPath), (docSnap) => {
            if (docSnap.exists()) setForm({ id: docSnap.id, ...docSnap.data() });
            setLoading(false);
        });
        return () => unsubscribe();
    }, [db, formDocPath]);

    if (loading) return <div className="text-center p-10">Loading summary...</div>;
    if (!form) return <div className="text-center p-10">Could not load summary.</div>;

    return (
        <div className="max-w-4xl mx-auto">
            <header className="mb-6 flex justify-between items-center">
                <button onClick={() => navigate('home')} className="text-blue-600 hover:underline">← Back to Polls</button>
                <button onClick={() => navigate('builder', form.id)} className="text-sm flex items-center gap-1 text-gray-600 hover:text-blue-600"><Edit size={16} /> Edit Poll</button>
            </header>
            <div className="bg-white p-8 rounded-lg shadow-md">
                <h1 className="text-3xl font-bold text-gray-800">{form.title}</h1>
                <p className="text-gray-600 mt-1">{form.description}</p>
            </div>
            {form.questions.map(q => (
                <div key={q.id} className="bg-white p-6 rounded-lg shadow-md mt-6">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4">{q.text}</h2>
                    {q.type === 'rating-poll' && q.options.sort((a,b) => b.avgRating - a.avgRating).map(opt => (
                        <div key={opt.id} className="mb-6">
                            <h3 className="text-lg font-semibold">{opt.text}</h3>
                            <p className="text-sm text-gray-500">Average: <span className="font-bold text-amber-500">{opt.avgRating.toFixed(2)}</span> stars from <span className="font-bold">{opt.ratingCount}</span> votes</p>
                            <div className="mt-2 space-y-1">
                                {[5, 4, 3, 2, 1].map(star => {
                                    const count = Object.values(opt.ratings).filter(r => r === star).length;
                                    const percentage = opt.ratingCount > 0 ? (count / opt.ratingCount) * 100 : 0;
                                    return (
                                        <div key={star} className="flex items-center gap-2">
                                            <span className="text-xs w-12">{star} star{star > 1 && 's'}</span>
                                            <div className="w-full bg-gray-200 rounded-full h-4">
                                                <div className="bg-blue-500 h-4 rounded-full text-right" style={{ width: `${percentage}%` }}>
                                                    <span className="px-2 text-white text-xs font-medium">{count}</span>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

// --- Helper Components ---
function CommentsSection({ comments, newComment, setNewComment, onPost, disabled }) {
    const commentsEndRef = useRef(null);
    useEffect(() => {
        commentsEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [comments]);
    return (
        <div className="mt-8 bg-white p-6 rounded-lg shadow-md">
            <h2 className="text-xl font-bold mb-4">Comments</h2>
            <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                {comments.map(comment => (
                    <div key={comment.id} className="flex gap-3">
                        <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-600 text-sm">
                            {comment.authorName.substring(0, 2).toUpperCase()}
                        </div>
                        <div>
                            <p className="font-semibold text-gray-800">{comment.authorName}</p>
                            <p className="text-gray-700">{comment.text}</p>
                            <p className="text-xs text-gray-400 mt-1">{comment.createdAt?.toDate().toLocaleString()}</p>
                        </div>
                    </div>
                ))}
                <div ref={commentsEndRef} />
            </div>
            <div className="mt-4 flex gap-2 border-t pt-4">
                <input type="text" value={newComment} onChange={e => setNewComment(e.target.value)} placeholder={disabled ? "Comments are disabled" : "Write a comment..."} className="w-full p-2 border border-gray-300 rounded-md" disabled={disabled} />
                <button onClick={onPost} className="px-4 py-2 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-400" disabled={disabled}>
                    <Send size={20} />
                </button>
            </div>
        </div>
    );
}

function StatusPill({ status }) {
    const styles = {
        draft: 'bg-yellow-100 text-yellow-800',
        published: 'bg-green-100 text-green-800',
        closed: 'bg-red-100 text-red-800',
    };
    const icons = {
        draft: <Edit size={12} />,
        published: <Unlock size={12} />,
        closed: <Lock size={12} />,
    };
    return (
        <span className={`text-xs font-semibold uppercase px-3 py-1 rounded-full flex items-center gap-1.5 ${styles[status]}`}>
            {icons[status]}
            {status}
        </span>
    );
}

function StarRating({ rating, onRate, totalStars = 5, disabled = false }) {
    const [hover, setHover] = useState(0);
    return (
        <div className="flex items-center">
            {[...Array(totalStars)].map((_, index) => {
                const starValue = index + 1;
                return (
                    <button type="button" key={starValue} className={`bg-transparent border-none ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
                        onClick={() => !disabled && onRate(starValue)}
                        onMouseEnter={() => !disabled && setHover(starValue)}
                        onMouseLeave={() => !disabled && setHover(0)}
                        disabled={disabled}
                    >
                        <Star className="transition-colors" color={starValue <= (hover || rating) ? "#ffc107" : "#e4e5e9"} fill={starValue <= (hover || rating) ? "#ffc107" : "#e4e5e9"} size={24} />
                    </button>
                );
            })}
        </div>
    );
}

function ShareModal({ link, onClose }) {
    const [copied, setCopied] = useState(false);
    const inputRef = useRef(null);
    const copyToClipboard = () => {
        inputRef.current.select();
        try {
            document.execCommand('copy');
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-800">Share Poll</h2>
                    <button onClick={onClose} className="text-gray-500 hover:text-gray-800">&times;</button>
                </div>
                <p className="text-gray-600 mb-2">Anyone with this link can respond.</p>
                <div className="flex gap-2">
                    <input ref={inputRef} type="text" readOnly value={link} className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50" />
                    <button onClick={copyToClipboard} className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">{copied ? 'Copied!' : 'Copy'}</button>
                </div>
            </div>
        </div>
    );
}
