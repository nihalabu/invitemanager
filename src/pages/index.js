import { useEffect, useState } from 'react';
import { auth, db } from '@/lib/firebase';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { collection, addDoc, getDocs, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';

export default function Home() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [invitations, setInvitations] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddForm, setShowAddForm] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [filterType, setFilterType] = useState('all'); // 'all', 'family', 'friend'

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginError, setLoginError] = useState('');

  const [formData, setFormData] = useState({
    invitedPersonName: '',
    familyMemberCount: 1,
    familyMembers: [''],
    phone: '',
    isInvited: false,
    type: 'family' // 'family' or 'friend'
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        fetchInvitations();
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError('');

    try {
      await signInWithEmailAndPassword(auth, email, password);
      setEmail('');
      setPassword('');
    } catch (error) {
      console.error('Login error:', error);
      if (error.code === 'auth/invalid-credential') {
        setLoginError('Invalid email or password');
      } else if (error.code === 'auth/user-not-found') {
        setLoginError('No account found with this email');
      } else if (error.code === 'auth/wrong-password') {
        setLoginError('Incorrect password');
      } else {
        setLoginError('Login failed. Please try again.');
      }
    }
  };

  const fetchInvitations = async () => {
    try {
      const q = query(collection(db, 'invitations'), orderBy('invitedPersonName'));
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setInvitations(data);
    } catch (error) {
      console.error('Error fetching invitations:', error);
    }
  };

  const openAddForm = (type) => {
    setFormData({
      invitedPersonName: '',
      familyMemberCount: type === 'friend' ? 1 : 2,
      familyMembers: type === 'friend' ? [''] : ['', ''],
      phone: '',
      isInvited: false,
      type: type
    });
    setShowAddForm(true);
  };

  const handleAddInvitation = async (e) => {
    e.preventDefault();

    if (formData.invitedPersonName.trim() === '') {
      alert('Please enter the person name');
      return;
    }

    try {
      const cleanedFamilyMembers = formData.familyMembers.map(m => m.trim());

      // Create temporary ID for optimistic update
      const tempId = 'temp_' + Date.now();

      const newInvitation = {
        id: tempId,
        invitedPersonName: formData.invitedPersonName.trim(),
        familyMemberCount: parseInt(formData.familyMemberCount),
        familyMembers: cleanedFamilyMembers,
        phone: formData.phone.trim(),
        isInvited: formData.isInvited,
        type: formData.type,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Update UI immediately
      setInvitations([...invitations, newInvitation]);

      // Reset form immediately
      setFormData({
        invitedPersonName: '',
        familyMemberCount: 1,
        familyMembers: [''],
        phone: '',
        isInvited: false,
        type: 'family'
      });
      setShowAddForm(false);

      // Save to database in background
      const docRef = await addDoc(collection(db, 'invitations'), {
        invitedPersonName: newInvitation.invitedPersonName,
        familyMemberCount: newInvitation.familyMemberCount,
        familyMembers: newInvitation.familyMembers,
        phone: newInvitation.phone,
        isInvited: newInvitation.isInvited,
        type: newInvitation.type,
        createdAt: newInvitation.createdAt,
        updatedAt: newInvitation.updatedAt
      });

      // Replace temp ID with real ID from Firestore
      setInvitations(prev => prev.map(inv =>
        inv.id === tempId ? { ...inv, id: docRef.id } : inv
      ));

    } catch (error) {
      console.error('Error adding invitation:', error);
      alert('Failed to add invitation: ' + error.message);
      fetchInvitations();
    }
  };

  const toggleInvited = async (id, currentStatus) => {
    setUpdatingId(id);
    try {
      // Update UI immediately
      setInvitations(invitations.map(inv =>
        inv.id === id ? { ...inv, isInvited: !currentStatus } : inv
      ));

      // Update database
      await updateDoc(doc(db, 'invitations', id), {
        isInvited: !currentStatus,
        updatedAt: new Date()
      });
    } catch (error) {
      console.error('Error updating:', error);
      fetchInvitations();
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteInvitation = async (id) => {
    if (confirm('Are you sure you want to delete this invitation?')) {
      try {
        // Remove from UI immediately
        setInvitations(invitations.filter(inv => inv.id !== id));

        // Delete from database in background
        await deleteDoc(doc(db, 'invitations', id));
      } catch (error) {
        console.error('Error deleting:', error);
        alert('Failed to delete invitation');
        fetchInvitations();
      }
    }
  };

  const filteredInvitations = invitations.filter(inv => {
    const search = searchTerm.toLowerCase();
    const matchesSearch = inv.invitedPersonName.toLowerCase().includes(search) ||
      inv.familyMembers.some(member => member.toLowerCase().includes(search));

    const matchesType = filterType === 'all' || inv.type === filterType;

    return matchesSearch && matchesType;
  });

  const updateFamilyMembers = (count) => {
    const numCount = parseInt(count) || 1;
    const clampedCount = Math.max(1, Math.min(20, numCount));
    const newMembers = Array(clampedCount).fill('');
    setFormData({
      ...formData,
      familyMemberCount: clampedCount.toString(),
      familyMembers: newMembers
    });
  };


  const updateMemberName = (index, name) => {
    const updatedMembers = [...formData.familyMembers];
    updatedMembers[index] = name;
    setFormData({ ...formData, familyMembers: updatedMembers });
  };

  const totalInvited = invitations.filter(inv => inv.isInvited).length;
  const totalGuests = invitations
    .filter(inv => inv.isInvited)
    .reduce((sum, inv) => sum + parseInt(inv.familyMemberCount || 0), 0);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-lg w-full max-w-md">
          <h1 className="text-3xl font-bold text-gray-800 mb-2 text-center">Wedding Invitation Manager</h1>
          <p className="text-gray-600 mb-6 text-center">Sign in to manage invitations</p>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your-email@gmail.com"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {loginError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-2 rounded-lg text-sm">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-medium"
            >
              Sign In
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <h1 className="text-2xl md:text-3xl font-bold text-gray-800">Wedding Invitations</h1>
              <p className="text-gray-600 text-sm mt-1">Welcome, {user.email}</p>
            </div>
            <button
              onClick={() => signOut(auth)}
              className="text-red-600 hover:text-red-700 text-sm font-medium"
            >
              Sign Out
            </button>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-blue-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Total Families</p>
              <p className="text-2xl font-bold text-blue-600">{invitations.length}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Invited</p>
              <p className="text-2xl font-bold text-green-600">{totalInvited}</p>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Total Guests</p>
              <p className="text-2xl font-bold text-purple-600">{totalGuests}</p>
            </div>
            <div className="bg-orange-50 p-4 rounded-lg">
              <p className="text-sm text-gray-600">Pending</p>
              <p className="text-2xl font-bold text-orange-600">{invitations.length - totalInvited}</p>
            </div>
          </div>
        </div>

        {/* Search & Add */}
        <div className="bg-white rounded-2xl shadow-lg p-6 mb-6">
          {/* Filter Tabs */}
          <div className="flex gap-2 mb-4 overflow-x-auto">
            <button
              onClick={() => setFilterType('all')}
              className={`px-4 py-2 rounded-lg font-medium transition whitespace-nowrap ${filterType === 'all'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              All ({invitations.length})
            </button>
            <button
              onClick={() => setFilterType('family')}
              className={`px-4 py-2 rounded-lg font-medium transition whitespace-nowrap ${filterType === 'family'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              👨‍👩‍👧‍👦 Families ({invitations.filter(inv => inv.type === 'family').length})
            </button>
            <button
              onClick={() => setFilterType('friend')}
              className={`px-4 py-2 rounded-lg font-medium transition whitespace-nowrap ${filterType === 'friend'
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
            >
              👤 Friends ({invitations.filter(inv => inv.type === 'friend').length})
            </button>
          </div>

          <div className="flex flex-col md:flex-row gap-4">
            <input
              type="text"
              placeholder="Search by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => openAddForm('family')}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition whitespace-nowrap"
              >
                + Add Family
              </button>
              <button
                onClick={() => openAddForm('friend')}
                className="bg-purple-600 text-white px-6 py-2 rounded-lg hover:bg-purple-700 transition whitespace-nowrap"
              >
                + Add Friend
              </button>
            </div>
          </div>

          {/* Add Form */}
          {showAddForm && (
            <form onSubmit={handleAddInvitation} className="mt-6 p-4 bg-gray-50 rounded-lg">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold text-gray-800">
                  {formData.type === 'family' ? '👨‍👩‍👧‍👦 Add Family' : '👤 Add Friend'}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ✕
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <input
                  type="text"
                  placeholder={formData.type === 'family' ? 'Family Head Name *' : 'Friend Name *'}
                  value={formData.invitedPersonName}
                  onChange={(e) => setFormData({ ...formData, invitedPersonName: e.target.value })}
                  className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  required
                />
                <input
                  type="tel"
                  placeholder="Phone (optional)"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {formData.type === 'family' && (
                <>
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Number of Family Members
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          const newCount = Math.max(1, parseInt(formData.familyMemberCount) - 1);
                          updateFamilyMembers(newCount.toString());
                        }}
                        className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center text-lg font-bold transition"
                      >
                        -
                      </button>
                      <div className="flex-1 text-center px-4 py-2 bg-white border border-gray-300 rounded-lg font-semibold text-lg">
                        {formData.familyMemberCount}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          const newCount = Math.min(20, parseInt(formData.familyMemberCount) + 1);
                          updateFamilyMembers(newCount.toString());
                        }}
                        className="w-10 h-10 bg-gray-100 hover:bg-gray-200 rounded-lg flex items-center justify-center text-lg font-bold transition"
                      >
                        +
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">1-20 members (tap + or - to adjust)</p>
                  </div>



                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">Family Members Names (optional)</label>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {formData.familyMembers.map((member, index) => (
                        <input
                          key={index}
                          type="text"
                          placeholder={`Member ${index + 1}`}
                          value={member}
                          onChange={(e) => updateMemberName(index, e.target.value)}
                          className="px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}

              <button
                type="submit"
                className="w-full bg-green-600 text-white py-2 rounded-lg hover:bg-green-700 transition"
              >
                Add {formData.type === 'family' ? 'Family' : 'Friend'}
              </button>
            </form>
          )}
        </div>

        {/* Invitations List */}
        <div className="space-y-4">
          {filteredInvitations.length === 0 ? (
            <div className="bg-white rounded-2xl shadow-lg p-12 text-center">
              <p className="text-gray-500">No invitations found</p>
            </div>
          ) : (
            filteredInvitations.map(invitation => (
              <div key={invitation.id} className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition">
                <div className="flex flex-col md:flex-row justify-between items-start gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-xl font-bold text-gray-800">{invitation.invitedPersonName}</h3>
                      <span className={`text-xs px-2 py-1 rounded-full ${invitation.type === 'friend'
                        ? 'bg-purple-100 text-purple-700'
                        : 'bg-blue-100 text-blue-700'
                        }`}>
                        {invitation.type === 'friend' ? '👤 Friend' : '👨‍👩‍👧‍👦 Family'}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-4 text-sm text-gray-600 mb-3">
                      <span className="flex items-center gap-1">
                        👥 {invitation.familyMemberCount} {invitation.familyMemberCount === 1 ? 'person' : 'people'}
                      </span>
                      {invitation.phone && <span>📞 {invitation.phone}</span>}
                    </div>
                    {invitation.familyMembers.some(m => m) && (
                      <div className="flex flex-wrap gap-2">
                        {invitation.familyMembers.filter(m => m).map((member, idx) => (
                          <span key={idx} className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm">
                            {member}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col gap-2 w-full md:w-auto">
                    <button
                      onClick={() => toggleInvited(invitation.id, invitation.isInvited)}
                      disabled={updatingId === invitation.id}
                      className={`px-6 py-2 rounded-lg font-medium transition ${invitation.isInvited
                        ? 'bg-green-600 text-white hover:bg-green-700'
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                        } ${updatingId === invitation.id ? 'opacity-50 cursor-wait' : ''}`}
                    >
                      {invitation.isInvited ? '✓ Invited' : 'Not Invited'}
                    </button>
                    <button
                      onClick={() => deleteInvitation(invitation.id)}
                      className="px-6 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
