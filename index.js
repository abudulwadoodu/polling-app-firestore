import React, { useState, useEffect, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, doc, getDoc, setDoc, addDoc, collection, onSnapshot, query, serverTimestamp, updateDoc, orderBy } from 'firebase/firestore';
import { Plus, Trash2, BarChart2, Edit, Send, Share2, Eye, Star, ChevronUp, ChevronDown, Lock, Unlock, CheckCircle, Type as TypeIcon, MessageSquare, List, CheckSquare as CheckSquareIcon, ChevronDownSquare } from 'lucide-react';

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
            title: 'Untitled Form',
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
                <h1 className="text-3xl font-bold text-gray-800 mb-4 sm:mb-0">My Forms & Polls</h1>
                <button onClick={createNewForm} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700 transition-colors duration-200">
                    <Plus size={20} /><span>Create New</span>
                </button>
            </header>
            {loading ? <p>Loading...</p> : forms.length === 0 ? (
                <div className="text-center py-16 px-6 bg-white rounded-lg shadow-sm">
                    <h2 className="text-xl font-semibold text-gray-700">No forms yet!</h2>
                    <p className="text-gray-500 mt-2">Click "Create New" to get started.</p>
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
        const optionTypes = ['multiple-choice', 'checkboxes', 'dropdown', 'rating-poll'];
        if (optionTypes.includes(type)) {
            newQuestion.options = type === 'rating-poll' ? [] : [{id: crypto.randomUUID(), text: 'Option 1'}];
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
        const questionType = newQuestions[qIndex].type;
        const newOption = questionType === 'rating-poll' 
            ? { id: crypto.randomUUID(), text: `New Option`, imageUrl: '', ratings: {}, avgRating: 0, ratingCount: 0, creatorId: user.uid }
            : { id: crypto.randomUUID(), text: `Option ${newQuestions[qIndex].options.length + 1}` };
        newQuestions[qIndex].options.push(newOption);
        handleFormChange('questions', newQuestions);
    };

    const deleteOption = (qIndex, oIndex) => {
        const newQuestions = [...form.questions];
        newQuestions[qIndex].options = newQuestions[qIndex].options.filter((_, i) => i !== oIndex);
        handleFormChange('questions', newQuestions);
    };
    
    const [showShareModal, setShowShareModal] = useState(false);

    if (loading || !form) return <div className="text-center p-10">Loading form builder...</div>;

    const shareableLink = `${window.location.origin}${window.location.pathname}?page=viewer&formId=${form.id}&authorId=${user.uid}&mode=respond`;

    return (
        <div className="max-w-3xl mx-auto">
            <header className="flex justify-between items-center mb-6">
                <button onClick={() => navigate('home')} className="text-blue-600 hover:underline">← Back to Home</button>
                <div className="flex gap-2">
                    <button onClick={() => navigate('summary', form.id)} className="px-4 py-2 text-sm bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">Responses</button>
                    <button onClick={() => setShowShareModal(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg shadow-md hover:bg-blue-700"><Share2 size={18} /> Share</button>
                </div>
            </header>

            <div className="bg-white p-6 sm:p-8 rounded-lg shadow-md border-t-8 border-blue-600">
                <input type="text" value={form.title} onChange={(e) => handleFormChange('title', e.target.value)} placeholder="Form Title" className="text-3xl font-bold w-full border-b-2 border-gray-200 focus:border-blue-500 outline-none pb-2 mb-4" />
                <input type="text" value={form.description} onChange={(e) => handleFormChange('description', e.target.value)} placeholder="Form description" className="w-full border-b border-gray-200 focus:border-blue-500 outline-none pb-2 mb-4 text-gray-600" />
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
                    <QuestionBuilder key={q.id} q={q} qIndex={qIndex} handleQuestionChange={handleQuestionChange} deleteQuestion={deleteQuestion} handleOptionChange={handleOptionChange} addOption={addOption} deleteOption={deleteOption} />
                ))}
            </div>

            <AddQuestionToolbar addQuestion={addQuestion} />
            
            {showShareModal && <ShareModal link={shareableLink} onClose={() => setShowShareModal(false)} />}
        </div>
    );
}


// --- Form Viewer/Responder Component ---
function FormViewer({ db, user, navigate, formId: propFormId }) {
    const [form, setForm] = useState(null);
    const [responses, setResponses] = useState({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [submitted, setSubmitted] = useState(false);
    const [newOptionText, setNewOptionText] = useState("");

    const urlParams = new URLSearchParams(window.location.search);
    const urlFormId = urlParams.get('formId');
    const urlAuthorId = urlParams.get('authorId');

    const formId = urlFormId || propFormId;
    const authorId = urlAuthorId || (form ? form.authorId : (user ? user.uid : null));

    const formDocPath = authorId && formId ? `/artifacts/${appId}/users/${authorId}/forms/${formId}` : null;
    
    useEffect(() => {
        if (!formDocPath) {
            setError("Form link is invalid.");
            setLoading(false);
            return;
        }
        const unsubscribe = onSnapshot(doc(db, formDocPath), (docSnap) => {
            if (docSnap.exists()) {
                const formData = docSnap.data();
                setForm({ id: docSnap.id, ...formData });
                // Initialize responses state
                const initialResponses = {};
                formData.questions.forEach(q => {
                    if (q.type === 'rating-poll') {
                         initialResponses[q.id] = {}; // For ratings
                    } else {
                        initialResponses[q.id] = q.type === 'checkboxes' ? [] : '';
                    }
                });
                setResponses(initialResponses);
            } else {
                setError("Form/Poll not found.");
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [db, formDocPath]);

    const handleResponseChange = (questionId, questionType, value, optionId = null) => {
        setResponses(prev => {
            if (questionType === 'checkboxes') {
                const currentValues = prev[questionId] || [];
                if (currentValues.includes(value)) {
                    return { ...prev, [questionId]: currentValues.filter(v => v !== value) };
                } else {
                    return { ...prev, [questionId]: [...currentValues, value] };
                }
            }
            if (questionType === 'rating-poll') {
                return {...prev, [questionId]: {...prev[questionId], [optionId]: value}};
            }
            return { ...prev, [questionId]: value };
        });
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

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        // Validation
        for (const q of form.questions) {
            if (q.required) {
                const response = responses[q.id];
                if ((q.type === 'checkboxes' && response.length === 0) || (q.type !== 'rating-poll' && !response)) {
                    setError(`Question "${q.text}" is required.`);
                    return;
                }
            }
        }
        
        // Handle rating poll updates separately before submission
        for (const q of form.questions) {
            if (q.type === 'rating-poll') {
                const userRatings = responses[q.id];
                if (Object.keys(userRatings).length > 0) {
                     const newQuestions = JSON.parse(JSON.stringify(form.questions));
                     const question = newQuestions.find(fq => fq.id === q.id);
                     Object.entries(userRatings).forEach(([optionId, rating]) => {
                        const option = question.options.find(o => o.id === optionId);
                        if(option && !option.ratings[user.uid]) { // Only update if not already rated
                            option.ratings[user.uid] = rating;
                            const ratingsArray = Object.values(option.ratings);
                            option.ratingCount = ratingsArray.length;
                            option.avgRating = ratingsArray.reduce((a, b) => a + b, 0) / option.ratingCount;
                        }
                     });
                     await updateDoc(doc(db, formDocPath), { questions: newQuestions });
                }
            }
        }

        const responsesPath = `${formDocPath}/responses`;
        try {
            await addDoc(collection(db, responsesPath), {
                answers: responses,
                submittedAt: serverTimestamp(),
                submitterId: user.uid
            });
            setSubmitted(true);
        } catch (err) {
            console.error("Error submitting response:", err);
            setError("Failed to submit response.");
        }
    };


    if (loading) return <div className="text-center p-10">Loading...</div>;
    if (error) return <div className="text-center p-10 text-red-600">{error}</div>;
    if (!form) return <div className="text-center p-10">Not available.</div>;
    if (submitted) return <div className="max-w-2xl mx-auto text-center py-16 px-6 bg-white rounded-lg shadow-lg"><h1 className="text-2xl font-bold">Response Submitted!</h1></div>;

    const isClosed = form.status === 'closed';

    return (
        <div className="max-w-2xl mx-auto">
            <header className="mb-6"><button onClick={() => navigate('home')} className="text-blue-600 hover:underline">← Back to Home</button></header>
            <form onSubmit={handleSubmit} className="bg-white p-8 rounded-lg shadow-md border-t-8 border-indigo-600 space-y-8">
                <div>
                    <div className="flex justify-between items-start">
                        <h1 className="text-3xl font-bold text-gray-800">{form.title}</h1>
                        <StatusPill status={form.status} />
                    </div>
                    <p className="text-gray-600 mt-2">{form.description}</p>
                </div>
                <hr/>
                {form.questions.map((q, qIndex) => (
                    <QuestionViewer key={q.id} q={q} qIndex={qIndex} response={responses[q.id]} handleResponseChange={handleResponseChange} disabled={isClosed} newOptionText={newOptionText} setNewOptionText={setNewOptionText} handleAddNewOption={handleAddNewOption} form={form} />
                ))}
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <button type="submit" className="w-full py-3 px-4 bg-blue-600 text-white font-semibold rounded-lg shadow-md hover:bg-blue-700 disabled:bg-gray-400" disabled={isClosed}>Submit</button>
            </form>
        </div>
    );
}


// --- Response Summary Component ---
function ResponseSummary({ db, user, navigate, formId }) {
    const [form, setForm] = useState(null);
    const [responses, setResponses] = useState([]);
    const [loading, setLoading] = useState(true);
    const formDocPath = `/artifacts/${appId}/users/${user.uid}/forms/${formId}`;

    useEffect(() => {
        const unsubForm = onSnapshot(doc(db, formDocPath), (docSnap) => {
            if (docSnap.exists()) setForm({ id: docSnap.id, ...docSnap.data() });
        });
        const responsesPath = `${formDocPath}/responses`;
        const q = query(collection(db, responsesPath));
        const unsubResponses = onSnapshot(q, (querySnapshot) => {
            setResponses(querySnapshot.docs.map(doc => doc.data()));
            setLoading(false);
        });
        return () => { unsubForm(); unsubResponses(); };
    }, [db, formDocPath]);

    if (loading) return <div className="text-center p-10">Loading summary...</div>;
    if (!form) return <div className="text-center p-10">Could not load summary.</div>;

    return (
        <div className="max-w-4xl mx-auto">
            <header className="mb-6 flex justify-between items-center">
                <button onClick={() => navigate('home')} className="text-blue-600 hover:underline">← Back to Home</button>
                <button onClick={() => navigate('builder', form.id)} className="text-sm flex items-center gap-1 text-gray-600 hover:text-blue-600"><Edit size={16} /> Edit Form</button>
            </header>
            <div className="bg-white p-8 rounded-lg shadow-md mb-6">
                <h1 className="text-3xl font-bold text-gray-800">{form.title}</h1>
                <p className="text-gray-600 mt-1">{form.description}</p>
                <p className="mt-4 text-lg font-semibold text-blue-700">{responses.length} Responses</p>
            </div>
            {form.questions.map(q => (
                <div key={q.id} className="bg-white p-6 rounded-lg shadow-md mt-6">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4">{q.text}</h2>
                    <ResponseVisualizer question={q} responses={responses} form={form} />
                </div>
            ))}
        </div>
    );
}

// --- Helper & Sub-Components ---

function QuestionBuilder({ q, qIndex, handleQuestionChange, deleteQuestion, handleOptionChange, addOption, deleteOption }) {
    const optionBased = ['multiple-choice', 'checkboxes', 'dropdown', 'rating-poll'];
    return (
        <div className="bg-white p-6 rounded-lg shadow-md border border-gray-200">
            <div className="flex justify-between items-start gap-4">
                <input type="text" value={q.text} onChange={(e) => handleQuestionChange(qIndex, 'text', e.target.value)} placeholder="Question" className="text-lg font-semibold w-full border-b border-gray-200 focus:border-blue-500 outline-none pb-2" />
                <div className="flex items-center gap-4">
                    <div className="flex items-center">
                        <input type="checkbox" id={`required-${q.id}`} checked={q.required} onChange={(e) => handleQuestionChange(qIndex, 'required', e.target.checked)} className="h-4 w-4 text-blue-600 border-gray-300 rounded" />
                        <label htmlFor={`required-${q.id}`} className="ml-2 text-sm text-gray-600">Required</label>
                    </div>
                    <button onClick={() => deleteQuestion(qIndex)} className="text-gray-500 hover:text-red-600"><Trash2 size={20} /></button>
                </div>
            </div>
            <div className="mt-4">
                {q.type === 'short-answer' && <p className="text-gray-400 border-b-2 border-dashed w-1/2">Short answer text</p>}
                {q.type === 'paragraph' && <p className="text-gray-400 border-b-2 border-dashed w-full">Long answer text</p>}
                {optionBased.includes(q.type) && (
                    <div className="space-y-2">
                        {q.options.map((opt, oIndex) => (
                            <div key={opt.id} className="flex items-center gap-2">
                                {q.type !== 'rating-poll' && <input type={q.type === 'checkboxes' ? 'checkbox' : 'radio'} disabled className="h-4 w-4" />}
                                <input type="text" value={opt.text} onChange={(e) => handleOptionChange(qIndex, oIndex, 'text', e.target.value)} className="w-full p-1 border-b border-transparent focus:border-gray-300 outline-none" placeholder="Option text" />
                                {q.type === 'rating-poll' && <input type="text" value={opt.imageUrl} onChange={(e) => handleOptionChange(qIndex, oIndex, 'imageUrl', e.target.value)} className="w-1/2 p-1 border-b border-transparent focus:border-gray-300 outline-none" placeholder="Image URL (optional)" />}
                                <button onClick={() => deleteOption(qIndex, oIndex)} className="text-gray-400 hover:text-red-500">×</button>
                            </div>
                        ))}
                        <button onClick={() => addOption(qIndex)} className="text-sm text-blue-600 hover:underline mt-2">Add option</button>
                    </div>
                )}
            </div>
        </div>
    );
}

function QuestionViewer({ q, qIndex, response, handleResponseChange, disabled, newOptionText, setNewOptionText, handleAddNewOption, form }) {
    if (!response) return null; // Don't render if response state isn't ready
    
    return (
        <div className="p-4 border border-gray-200 rounded-md">
            <label className="block text-lg font-semibold text-gray-800 mb-3">
                {q.text} {q.required && <span className="text-red-500">*</span>}
            </label>
            {q.type === 'short-answer' && <input type="text" value={response} onChange={(e) => handleResponseChange(q.id, q.type, e.target.value)} className="w-full p-2 border border-gray-300 rounded-md" required={q.required} disabled={disabled} />}
            {q.type === 'paragraph' && <textarea value={response} onChange={(e) => handleResponseChange(q.id, q.type, e.target.value)} className="w-full p-2 border border-gray-300 rounded-md" rows="4" required={q.required} disabled={disabled}></textarea>}
            {q.type === 'multiple-choice' && q.options.map(opt => (
                <div key={opt.id} className="flex items-center mb-2">
                    <input type="radio" id={opt.id} name={q.id} value={opt.text} checked={response === opt.text} onChange={(e) => handleResponseChange(q.id, q.type, e.target.value)} className="h-4 w-4 text-blue-600" required={q.required} disabled={disabled} />
                    <label htmlFor={opt.id} className="ml-3 text-md text-gray-700">{opt.text}</label>
                </div>
            ))}
            {q.type === 'checkboxes' && q.options.map(opt => (
                <div key={opt.id} className="flex items-center mb-2">
                    <input type="checkbox" id={opt.id} name={q.id} value={opt.text} checked={response.includes(opt.text)} onChange={(e) => handleResponseChange(q.id, q.type, e.target.value)} className="h-4 w-4 text-blue-600" disabled={disabled} />
                    <label htmlFor={opt.id} className="ml-3 text-md text-gray-700">{opt.text}</label>
                </div>
            ))}
            {q.type === 'dropdown' && (
                <select value={response} onChange={(e) => handleResponseChange(q.id, q.type, e.target.value)} className="w-full p-2 border border-gray-300 rounded-md" required={q.required} disabled={disabled}>
                    <option value="">Select an option</option>
                    {q.options.map(opt => <option key={opt.id} value={opt.text}>{opt.text}</option>)}
                </select>
            )}
            {q.type === 'rating-poll' && (
                 <div className="space-y-4">
                    {form.questions[qIndex].options.map(opt => (
                        <div key={opt.id} className="p-4 border rounded-lg transition-all duration-300 bg-white">
                            <div className="flex items-center gap-4">
                                {opt.imageUrl && <img src={opt.imageUrl} alt={opt.text} className="w-24 h-24 object-cover rounded-md" onError={(e) => { e.target.style.display = 'none'; }} />}
                                <div className="flex-grow">
                                    <h3 className="text-lg font-semibold text-gray-900">{opt.text}</h3>
                                    <StarRating rating={response[opt.id] || 0} onRate={(rate) => handleResponseChange(q.id, q.type, rate, opt.id)} disabled={disabled} />
                                    <p className="text-sm text-gray-500 mt-1">
                                        Current avg: {opt.avgRating?.toFixed(2) || '0.00'} stars ({opt.ratingCount || 0} votes)
                                    </p>
                                </div>
                            </div>
                        </div>
                    ))}
                    {!disabled && <div className="pt-4 mt-4 border-t">
                        <label className="font-semibold text-gray-700">Add an option:</label>
                        <div className="flex gap-2 mt-2">
                            <input type="text" value={newOptionText} onChange={e => setNewOptionText(e.target.value)} placeholder="Your suggestion" className="w-full p-2 border border-gray-300 rounded-md" disabled={disabled} />
                            <button type="button" onClick={() => handleAddNewOption(qIndex)} className="px-4 py-2 bg-indigo-600 text-white font-semibold rounded-lg shadow-md hover:bg-indigo-700" disabled={disabled}>Add</button>
                        </div>
                    </div>}
                </div>
            )}
        </div>
    );
}


function AddQuestionToolbar({ addQuestion }) {
    const questionTypes = [
        { type: 'short-answer', label: 'Short Answer', icon: <TypeIcon size={16} /> },
        { type: 'paragraph', label: 'Paragraph', icon: <MessageSquare size={16} /> },
        { type: 'multiple-choice', label: 'Multiple Choice', icon: <List size={16} /> },
        { type: 'checkboxes', label: 'Checkboxes', icon: <CheckSquareIcon size={16} /> },
        { type: 'dropdown', label: 'Dropdown', icon: <ChevronDownSquare size={16} /> },
        { type: 'rating-poll', label: 'Rating Poll', icon: <Star size={16} /> },
    ];
    return (
        <div className="mt-6 p-4 bg-white rounded-lg shadow-md flex items-center justify-center gap-2 flex-wrap">
            <span className="text-gray-600 font-semibold mr-2">Add Question:</span>
            {questionTypes.map(qt => (
                <button key={qt.type} onClick={() => addQuestion(qt.type)} className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-md">
                    {qt.icon} {qt.label}
                </button>
            ))}
        </div>
    );
}

function ResponseVisualizer({ question, responses, form }) {
    const answers = responses.map(r => r.answers[question.id]).filter(Boolean);
    if (answers.length === 0 && question.type !== 'rating-poll') return <p className="text-gray-500">No responses yet.</p>;

    if (['short-answer', 'paragraph'].includes(question.type)) {
        return (
            <div className="space-y-2 max-h-60 overflow-y-auto">
                {answers.map((ans, i) => <div key={i} className="bg-gray-50 p-2 border-l-2">{ans}</div>)}
            </div>
        );
    }
    
    if (['multiple-choice', 'dropdown', 'checkboxes'].includes(question.type)) {
        const stats = {};
        const allAnswers = question.type === 'checkboxes' ? answers.flat() : answers;
        allAnswers.forEach(ans => { stats[ans] = (stats[ans] || 0) + 1; });
        const totalVotes = allAnswers.length;

        return (
            <div className="space-y-3">
                {question.options.map(opt => {
                    const count = stats[opt.text] || 0;
                    const percentage = totalVotes > 0 ? ((count / totalVotes) * 100) : 0;
                    return (
                        <div key={opt.id}>
                            <div className="flex justify-between items-center text-sm text-gray-600 mb-1">
                                <span>{opt.text}</span>
                                <span>{count} vote(s)</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-4">
                                <div className="bg-blue-500 h-4 rounded-full flex items-center justify-end" style={{ width: `${percentage}%` }}>
                                   <span className="px-2 text-white text-xs font-medium">{percentage.toFixed(0)}%</span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        );
    }

    if (question.type === 'rating-poll') {
        const formQuestion = form.questions.find(q => q.id === question.id);
        if (!formQuestion) return <p>Loading rating data...</p>;
        return (
             <div className="space-y-6">
                {formQuestion.options.sort((a,b) => b.avgRating - a.avgRating).map(opt => (
                    <div key={opt.id}>
                        <h3 className="text-lg font-semibold">{opt.text}</h3>
                        <p className="text-sm text-gray-500">Average: <span className="font-bold text-amber-500">{opt.avgRating.toFixed(2)}</span> stars from <span className="font-bold">{opt.ratingCount}</span> votes</p>
                        <div className="mt-2 space-y-1">
                            {[5, 4, 3, 2, 1].map(star => {
                                const count = Object.values(opt.ratings || {}).filter(r => r === star).length;
                                const percentage = opt.ratingCount > 0 ? (count / opt.ratingCount) * 100 : 0;
                                return (
                                    <div key={star} className="flex items-center gap-2">
                                        <span className="text-xs w-12">{star} star{star > 1 && 's'}</span>
                                        <div className="w-full bg-gray-200 rounded-full h-4">
                                            <div className="bg-blue-500 h-4 rounded-full flex items-center justify-end" style={{ width: `${percentage}%` }}>
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
        );
    }

    return null;
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
                    <h2 className="text-xl font-bold text-gray-800">Share</h2>
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
